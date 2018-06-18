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
const _ = require('lodash');
const fs = require('fs');
const path = require('path');

const config = {
};

const configFile = __dirname + path.sep + 'config.json';

if(fs.existsSync(configFile)) {
    const configContent = fs.readFileSync(configFile, 'utf8');
    try {
        _.assign(config, JSON.parse(configContent));
    }
    catch(e) {
    }
}

srcDir = config.srcDir;
destDir = config.destDir;

if(!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir);
}

const PACK_FILE_SUFFIX = config.packFileSuffix;
const HACK_FILE_SUFFIX = config.hackFileSuffix;
const CONSTRUCTOR_PREFIX = config.constructorPrefix;
const STATIC_PREFIX = config.staticPrefix;

const TYPE_CONSTRUCTOR = 'constructor';
const TYPE_STATIC = 'static';
const TYPE_METHOD = 'method';
const TYPE_WEIGHTS = {
    [TYPE_CONSTRUCTOR]: 0,
    [TYPE_STATIC]: 1,
    [TYPE_METHOD]: 2,
};

const APEX_CLASS_NAME = config.apexClassName;

const RESERVED_WORDS = config.reservedWords;

const packs = [];

const packFileNames = _.filter(fs.readdirSync(srcDir), name => _.endsWith(name, PACK_FILE_SUFFIX));
_.each(packFileNames, packFileName => {
    const content = fs.readFileSync(srcDir + path.sep + packFileName, 'utf8');

    const pack = {};
    pack.name = packFileName;
    if(pack.name.endsWith(PACK_FILE_SUFFIX)) {
        pack.name = pack.name.substring(0, pack.name.length - PACK_FILE_SUFFIX.length);
    }

    packs.push(pack);

    pack.methods = [];

    const lines = _.split(content, '\n');
    _.each(lines, line => {
        if(_.isEmpty(line)) {
            return;
        }

        const method = {};

        if(_.startsWith(line, CONSTRUCTOR_PREFIX)) {
            line = line.substring(CONSTRUCTOR_PREFIX.length);
            method.type = TYPE_CONSTRUCTOR;
        }
        else if(_.startsWith(line, STATIC_PREFIX)) {
            line = line.substring(STATIC_PREFIX.length);
            method.type = TYPE_STATIC;
        }
        else {
            method.type = TYPE_METHOD;
        }

        let [ name, signature ] = _.split(line, '::');
        method.name = _.trim(name);

        const types = _.split(signature, '->').map(_.trim);

        const returnType = method.type === TYPE_CONSTRUCTOR ? 'void' : _.last(types);
        const paramTypes = method.type === TYPE_CONSTRUCTOR ? types : _.initial(types);

        method.returnType = returnType;
        if(method.returnType === 'void') {
            method.returnType = null;
        }

        method.paramTypes = [];
        _.each(paramTypes, type => {
            if(type === '()') {
                return;
            }

            method.paramTypes.push(type);
        });

        pack.methods.push(method);
    });

    pack.methods.sort((method1, method2) => {
        let ret = TYPE_WEIGHTS[method1.type] - TYPE_WEIGHTS[method2.type];
        ret = ret === 0 ? method1.name.localeCompare(method2.name) : ret;
        ret = ret === 0 ? -(_.size(method2.paramTypes) - _.size(method1.paramTypes)) : ret;

        return ret;
    });
});

const metaContent = fs.readFileSync(__dirname + path.sep + config.metaFile, 'utf8');

// Generate Pack Apex Class
fs.writeFileSync(destDir + path.sep + APEX_CLASS_NAME + '.cls-meta.xml', metaContent);

let lines = [];
lines.push(config.comment);
lines.push(`public class ${APEX_CLASS_NAME} {`);

lines.push('    private static Object nthArg(List<Object> args, Integer index) {');
lines.push('        return index >= 0 && index < args.size() ? args.get(index) : null;');
lines.push('    }');
lines.push('');

const getClassName = name => name + 'Cls';

const getMethodName = name => _.includes(RESERVED_WORDS, name) ? name + 'Fn' : name;

const getTypeClassName = pack => {
    const constructor = _.find(pack.methods, ['type', TYPE_CONSTRUCTOR]);

    if(constructor) {
        return constructor.name;
    }
    else {
        return pack.name;
    }
};

const offset = 1;

const getParamTypesCheckExpression = (paramTypes, offset) =>
    paramTypes.map((paramType, index) => paramType === 'Object' ? '' : ` && nthArg(args, ${index + offset}) instanceof ${paramType}`).join('');

const getParamsExpression = (paramTypes, offset) =>
    paramTypes.map((paramType, index) => `(${paramType})nthArg(args, ${index + offset})`).join(', ');

_.each(packs, pack => {
    const className = getClassName(pack.name);
    const typeClassName = getTypeClassName(pack);
    const methodGroups = _.groupBy(pack.methods, 'name');

    lines.push(`    public static final ${className}Funcs ${className} = new ${className}Funcs();`);
    lines.push('');

    lines.push(`    public class ${className}Funcs {`);
    lines.push(`        private Func base = new ${className}Func();`);
    lines.push(``);

    _.each(methodGroups, (group, name) => {
        const isConstrutor = group[0].type === TYPE_CONSTRUCTOR;
        const methodName = getMethodName(name);

        if(isConstrutor) {
            lines.push(`        public Func construct = base.apply('construct');`);
        }
        else {
            lines.push(`        public Func ${methodName} = base.apply('${methodName}');`);
        }
    });

    lines.push(`    }`);
    lines.push(``);

    lines.push(`    private class ${className}Func extends Func {`);
    lines.push(`        public override Object execN(List<Object> args) {`);
    lines.push(`            String funcName = (String)args.get(0);`);
    lines.push(``);

    let isFirst = true;

    _.each(methodGroups, (group, name) => {
        const isConstrutor = group[0].type === TYPE_CONSTRUCTOR;
        const methodName = getMethodName(name);

        if(isConstrutor) {
            const hackFileName = srcDir + path.sep + pack.name + '_constructor' + HACK_FILE_SUFFIX;

            if(fs.existsSync(hackFileName)) {
                const hackContent = fs.readFileSync(hackFileName, 'utf8');
                lines.push(hackContent);

                isFirst = false;
            }
            else {
                _.each(_.groupBy(group, method => _.size(method.paramTypes)), (methods, numOfParams) => {
                    if(_.size(methods) === 1) {
                        const method = methods[0];
                        lines.push(`            ${isFirst ? 'if' : 'else if'}(funcName == 'construct' && args.size() == ${_.parseInt(numOfParams) + offset}) {`);
                        lines.push(`                return new ${method.name}(${getParamsExpression(method.paramTypes, offset)});`);
                        lines.push(`            }`);

                        isFirst = false;
                    }
                    else {
                        _.each(methods, method => {
                            lines.push(`            ${isFirst ? 'if' : 'else if'}(funcName == 'construct'${getParamTypesCheckExpression(method.paramTypes, offset)}) {`);
                            lines.push(`                return new ${method.name}(${getParamsExpression(method.paramTypes, offset)});`);
                            lines.push(`            }`);

                            isFirst = false;
                        });
                    }
                });
            }
        }
        else {
            const hackFileName = srcDir + path.sep + pack.name + '_' + group[0].name + HACK_FILE_SUFFIX;

            if(fs.existsSync(hackFileName)) {
                const hackContent = fs.readFileSync(hackFileName, 'utf8');
                lines.push(hackContent);

                isFirst = false;
            }
            else {
                _.each(_.groupBy(group, method => _.size(method.paramTypes)), (methods, numOfParams) => {
                    _.each(methods, method => {
                        if(_.size(methods) === 1) {
                            if(method.type === TYPE_STATIC) {
                                lines.push(`            ${isFirst ? 'if' : 'else if'}(funcName == '${methodName}' && args.size() == ${_.parseInt(numOfParams) + offset}) {`);
                                if(method.returnType) {
                                    lines.push(`                return ${pack.name}.${method.name}(${getParamsExpression(method.paramTypes, offset)});`);
                                }
                                else {
                                    lines.push(`                ${pack.name}.${method.name}(${getParamsExpression(method.paramTypes, offset)});`);
                                    lines.push(`                return null;`);
                                }
                                lines.push(`            }`);
                            }
                            else {
                                lines.push(`            ${isFirst ? 'if' : 'else if'}(funcName == '${methodName}' && args.size() == ${_.parseInt(numOfParams) + 1 + offset}) {`);
                                if(method.returnType) {
                                    lines.push(`                return ((${typeClassName})nthArg(args, ${method.paramTypes.length + 1})).${method.name}(${getParamsExpression(method.paramTypes, offset)});`);
                                }
                                else {
                                    lines.push(`                ((${typeClassName})nthArg(args, ${method.paramTypes.length + 1})).${method.name}(${getParamsExpression(method.paramTypes, offset)});`);
                                    lines.push(`                return null;`);
                                }
                                lines.push(`            }`);
                            }
                        }
                        else {
                            if(method.type === TYPE_STATIC) {
                                lines.push(`            ${isFirst ? 'if' : 'else if'}(funcName == '${methodName}'${getParamTypesCheckExpression(method.paramTypes, offset)}) {`);
                                if(method.returnType) {
                                    lines.push(`                return ${pack.name}.${method.name}(${getParamsExpression(method.paramTypes, offset)});`);
                                }
                                else {
                                    lines.push(`                ${pack.name}.${method.name}(${getParamsExpression(method.paramTypes, offset)});`);
                                    lines.push(`                return null;`);
                                }
                                lines.push(`            }`);
                            }
                            else {
                                lines.push(`            ${isFirst ? 'if' : 'else if'}(funcName == '${methodName}'${getParamTypesCheckExpression(method.paramTypes, offset)} && nthArg(args, ${method.paramTypes.length + 1}) instanceof ${typeClassName}) {`);
                                if(method.returnType) {
                                    lines.push(`                return ((${typeClassName})nthArg(args, ${method.paramTypes.length + 1})).${method.name}(${getParamsExpression(method.paramTypes, offset)});`);
                                }
                                else {
                                    lines.push(`                ((${typeClassName})nthArg(args, ${method.paramTypes.length + 1})).${method.name}(${getParamsExpression(method.paramTypes, offset)});`);
                                    lines.push(`                return null;`);
                                }
                                lines.push(`            }`);
                            }
                        }

                        isFirst = false;
                    });
                });
            }
        }
    });

    lines.push(``);
    lines.push(`            return null;`);
    lines.push(`        }`);
    lines.push(`    }`);
    lines.push(``);
});

lines.push('}');

fs.writeFileSync(destDir + path.sep + APEX_CLASS_NAME + '.cls', lines.join('\n'));

console.log(`${APEX_CLASS_NAME}.cls has been generated.`);

// Generate Func Package
if(config.generateFuncPackage) {
    fs.writeFileSync(destDir + path.sep + APEX_CLASS_NAME + 'Package.cls-meta.xml', metaContent);

    lines = [];
    lines.push(config.comment);
    lines.push(`public class ${APEX_CLASS_NAME}Package extends Func.DefaultPackage {`);

    lines.push('    public override void init() {');

    _.each(packs, pack => {
        const className = getClassName(pack.name);
        const methodGroups = _.groupBy(pack.methods, 'name');

        _.each(methodGroups, (group, name) => {
            const isConstrutor = group[0].type === TYPE_CONSTRUCTOR;
            const methodName = isConstrutor ? 'construct' : getMethodName(name);

            lines.push(`        this.export('${className}.${methodName}', ${APEX_CLASS_NAME}.${className}.${methodName});`);
        });
    });

    lines.push('    }');
    lines.push('');

    lines.push('}');

    fs.writeFileSync(destDir + path.sep + APEX_CLASS_NAME + 'Package.cls', lines.join('\n'));

    console.log(`${APEX_CLASS_NAME}Package.cls has been generated.`);
}

// Generate Test Class
if(config.generateTestClass) {
    fs.writeFileSync(destDir + path.sep + APEX_CLASS_NAME + 'Test.cls-meta.xml', metaContent);

    lines = [];
    lines.push(config.comment);
    lines.push('@isTest');
    lines.push(`private class ${APEX_CLASS_NAME}Test {`);

    lines.push(`    private static Object defaultValue(String typeName) {`);
    lines.push(`        if(typeName == 'Boolean') {`);
    lines.push(`            return true;`);
    lines.push(`        }`);
    lines.push(`        else if(typeName == 'Integer') {`);
    lines.push(`            return (Integer)0;`);
    lines.push(`        }`);
    lines.push(`        else if(typeName == 'Long') {`);
    lines.push(`            return (Long)0;`);
    lines.push(`        }`);
    lines.push(`        else if(typeName == 'Double') {`);
    lines.push(`            return (Double)0;`);
    lines.push(`        }`);
    lines.push(`        else if(typeName == 'Decimal') {`);
    lines.push(`            return (Decimal)0;`);
    lines.push(`        }`);
    lines.push(`        else if(typeName == 'String') {`);
    lines.push(`            return '';`);
    lines.push(`        }`);
    lines.push(`        else if(typeName == 'SObject') {`);
    lines.push(`            return new Account();`);
    lines.push(`        }`);
    lines.push(`        else if(typeName == 'Date') {`);
    lines.push(`            return Date.newInstance(2018, 1, 1);`);
    lines.push(`        }`);
    lines.push(`        else if(typeName == 'Time') {`);
    lines.push(`            return Time.newInstance(10, 0, 0, 0);`);
    lines.push(`        }`);
    lines.push(`        else if(typeName == 'Datetime') {`);
    lines.push(`            return Datetime.newInstance(2018, 1, 1, 10, 0, 0);`);
    lines.push(`        }`);
    lines.push(`        else if(typeName == 'List<Object>') {`);
    lines.push(`            return new List<Object>();`);
    lines.push(`        }`);
    lines.push(`        else if(typeName == 'Set<Object>') {`);
    lines.push(`            return new Set<Object>();`);
    lines.push(`        }`);
    lines.push(`        else if(typeName == 'Map<String, Object>') {`);
    lines.push(`            return new Map<String, Object>();`);
    lines.push(`        }`);
    lines.push(`        else {`);
    lines.push(`            return null;`);
    lines.push(`        }`);
    lines.push(`    }`);
    lines.push(``);

    const getTestParams = method => method.paramTypes.map(paramType => `defaultValue('${paramType}')`).join(', ');

    _.each(packs, pack => {
        if(_.includes(config.skipTestCases, pack.name)) {
            return;
        }

        const className = getClassName(pack.name);
        const typeClassName = getTypeClassName(pack);
        const methodGroups = _.groupBy(pack.methods, 'name');

        lines.push(`    @isTest`);
        lines.push(`    private static void ${className}Test() {`);

        _.each(methodGroups, (group, name) => {
            const isConstrutor = group[0].type === TYPE_CONSTRUCTOR;
            const methodName = isConstrutor ? 'construct' : getMethodName(name);

            _.each(group, method => {
                lines.push(`        try {`);
                if(method.type === TYPE_METHOD) {
                    const params = getTestParams(method);
                    const allParams = _.isEmpty(params) ? `defaultValue('${typeClassName}')` : `${params}, defaultValue('${typeClassName}')`;
                    lines.push(`            ${APEX_CLASS_NAME}.${className}.${methodName}.runN(new List<Object>{ ${allParams} });`);
                }
                else {
                    lines.push(`            ${APEX_CLASS_NAME}.${className}.${methodName}.runN(new List<Object>{ ${getTestParams(method)} });`);
                }
                lines.push(`            System.assert(true);`);
                lines.push(`        }`);
                lines.push(`        catch(Exception e) {`);
                lines.push(`        }`);
                lines.push(``);
            });
        });

        lines.push('    }');
        lines.push('');
    });

    if(config.generateFuncPackage) {
        lines.push(`    @isTest`);
        lines.push(`    private static void packageTest() {`);
        lines.push(`        System.assert(new PackPackage().export() != null);`);
        lines.push(`    }`);
        lines.push(``);

    }
    lines.push('}');

    fs.writeFileSync(destDir + path.sep + APEX_CLASS_NAME + 'Test.cls', lines.join('\n'));

    console.log(`${APEX_CLASS_NAME}Test.cls has been generated.`);
}
