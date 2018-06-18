/**
 * MIT License
 *
 * Copyright (c) 2018 Click to Cloud Pty Ltd
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 **/
/**
 * You can use this to get the raw signatures from urls like
 * https://developer.salesforce.com/docs/atlas.en-us.apexcode.meta/apexcode/apex_methods_system_date.htm#apex_methods_system_date
 * 
 * Script on the developer console in the browser:
 * 
 * var content = '';
 * $('.helpHead4 + p').each(function() {
 *     var text = $(this).text();
 *     if(text.startsWith('public')) {
 *         content += text + '\n';
 *     }
 * });
 * console.log(content);
 * */
const _ = require('lodash');
const fs = require('fs');
const path = require('path');

const [ , , signatureFile ] = process.argv;

if(!signatureFile) {
    console.error('Usage: node retrieve.js <Signature File>');
    return;
}

const signatures = _.split(fs.readFileSync(__dirname + path.sep + signatureFile, 'utf8'), '\n');

_.each(signatures, signature => {
    if(_.isEmpty(signature)) {
        return;
    }

    const method = {};

    if(signature.startsWith('public ')) {
        signature = signature.substring(7);
    }

    if(signature.startsWith('static ')) {
        signature = signature.substring(7);
        method.static = true;
    }

    method.constructor = _.indexOf(signature, ' ') < 0 || _.indexOf(signature, '(') < _.indexOf(signature, ' ');

    let pos = -1;

    if(!method.constructor) {
        pos = signature.indexOf(' ');
        method.returnType = signature.substring(0, pos);
        if(method.returnType.toLowerCase() === 'void') {
            method.returnType = 'void';
        }
        signature = signature.substring(pos + 1);
    }

    pos = signature.indexOf('(');
    method.name = signature.substring(0, pos);

    let params = _.split(signature.substring(pos + 1, signature.length - 1), ', ');
    method.paramTypes = [];
    _.each(params, param => {
        const [ paramType,  ] = _.split(param, ' ');
        method.paramTypes.push(paramType || '()');
    });

    let output = '';
    if(method.static) {
        output += 'static ';
    }
    else if(method.constructor) {
        output += 'constructor ';
    }

    output += method.name + ' :: ';
    if(!method.constructor) {
        output += [ ...method.paramTypes, method.returnType ].join(' -> ');
    }
    else {
        output += method.paramTypes.join(' -> ');
    }

    console.log(output);
});
