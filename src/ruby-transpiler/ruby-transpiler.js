import { TranspilerSuper } from "../transpiler-super/transpiler-super.js";
import * as fs from "fs";

export class RubyTranspiler extends TranspilerSuper {
  corrections;

  constructor() {
    super();
    this.corrections = JSON.parse(fs.readFileSync("./src/ruby-transpiler/ruby.json"));
  }

  parse(node) {
    const code = this.recursiveParse(node)
    return this.correct(code)
  }

  recursiveParse(node) {
    this[node.type](node);
    return this.buffer.get()
  }
  
  correct(code) {
    for (const key of Object.keys(this.corrections)) {
      code = code.replace(new RegExp(key, 'gmi'), this.corrections[key]);
    }

    let regex = /Math.floor\((.+)\)/gm
    code = code.replace(regex, '($1).floor');

    let higherOrderFuncs = {}
    code = code.replace(/def (\w+)\(.+\)\n(.+\n)+/gmi, (def, $1) => {
        let funcDeclaration = def.matchAll(/def \w+\((.+)\)/gmi)
        for (const parameterList of funcDeclaration) {
          let params = parameterList[1].matchAll(/([^\s,]+\(.+?\))|([^\s,]+)/gmi)
          
          let pos = 0
          for (const param of params) {
            if (def.indexOf(param[0] + '\(') != -1) {
                def = def.replace(param[0] + '(', param[0] + '.call(')
                higherOrderFuncs[$1] = pos
            }
            pos++
          }
        }

        return def
    })

    for (const func of Object.keys(higherOrderFuncs)) {
      function replacer(param) {
        if (typeof(replacer.i) == 'undefined') {
          replacer.i = -1
        }
        replacer.i += 1

        console.log(param)

        if (replacer.i == higherOrderFuncs[func]) {
          return 'method(:' + param + ')'
        }

        return param
      }

      code = code.replace(/(.*(?<!def\s)mathematics\()((\w+(\([^()]+\))?(,\s)?)+)(\).+)/gmi, (match, preceding, params, opt1, opt2, opt3, following) => {
        return preceding + params.replace(/\w+(\(.+\))?/gmi, replacer) + following
      })
    }

    regex = /(\w+)\+\+/gmi
    code = code.replace(regex, '$1 += 1')

    code = code.replace(/puts\((.+)\)\n/gmi, (input, $1) => {
      let args = $1.split(' + ')

      for (let i = 0; i < args.length; i++) {
        if (args[i][0] != '\'' && args[i][0] != '"') {
          args[i] = '(' + args[i] + ')' + '.to_s'
        }
      }

      return 'puts(' + args.join(' + ') + ')\n'
    })

    return code
  }

  ExpressionStatement(node) {
    super.ExpressionStatement(node);
    this.buffer.newline();
  }

  FunctionDeclaration(node) {
    this.buffer.add("def ");
    super.FunctionDeclaration(node);
  }

  BlockStatement(node) {
    this.buffer.indent();
    this.buffer.newline();
    super.BlockStatement(node);
    this.buffer.trim();
    this.buffer.dedent();
    this.buffer.newline();
    this.buffer.add("end");
    this.buffer.newline();
  }

  IfStatement(node) {
    this.buffer.add("if ");
    this.recursiveParse(node.test);
    
    if (node.consequent.type != 'BlockStatement') {
      let tempNode = {type: 'ReturnStatement'}
      Object.assign(tempNode, node.consequent)
      node.consequent.type = 'BlockStatement'
      node.consequent.body = [tempNode]
      this.recursiveParse(node.consequent)
    }
    else {
      this.recursiveParse(node.consequent);
    }
    
    if (node.alternate) {
      this.buffer.deleteLines(1);
      this.buffer.add("else ");
      this.recursiveParse(node.alternate);
    }
  }

  VariableDeclaration(node) {
    super.VariableDeclaration(node);
    this.buffer.newline();
  }

  ReturnStatement(node) {
    this.buffer.add("return ");
    super.ReturnStatement(node);
    this.buffer.newline();
  }

  ForStatement(node) {
    this.recursiveParse(node.init)
    node.type = 'WhileStatement'
    node.body.body.push(node.update)
    this[node.type](node)
  }

  UpdateExpression(node) {
    if (node.prefix) {
      this.buffer.add(node.operator)
    }
    this.recursiveParse(node.argument)
    if (!node.prefix) {
      this.buffer.add(node.operator)
    }
  }
}