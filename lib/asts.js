var pt = require('parse-tools');

//  ---------------------------------------------------------------------------------------------------------------  //

var yate = require('./yate.js');

require('./types.js');
require('./scope.js');
require('./consts.js');
require('./ast.js');

var entities = require('./entities.json');

var no = require('nommon');

var yr = require('./runtime.js');

//  ---------------------------------------------------------------------------------------------------------------  //

yate.asts = {};

//  ---------------------------------------------------------------------------------------------------------------  //

function deentitify(s) {
    return s
        .replace(/&#(\d+);?/g, function (_, code) {
            return String.fromCharCode(code);
        })
        .replace(/&#[xX]([A-Fa-f0-9]+);?/g, function (_, hex) {
            return String.fromCharCode( parseInt(hex, 16) );
        })
        .replace(/&(\w+);/g, function (entity, name) {
            return entities[name] || entity;
        });
}

//  ---------------------------------------------------------------------------------------------------------------  //
//  items
//  ---------------------------------------------------------------------------------------------------------------  //

yate.asts.items = {};

yate.asts.items._init = function(items) {
    this.Items = items || [];
};

//  ---------------------------------------------------------------------------------------------------------------  //

yate.asts.items.add = function(item) {
    this.Items.push(item);
};

yate.asts.items.length = function() {
    return this.Items.length;
};

yate.asts.items.first = function() {
    return this.Items[0];
};

yate.asts.items.last = function() {
    var items = this.Items;
    return items[items.length - 1];
};

yate.asts.items.empty = function() {
    return (this.Items.length === 0);
};

yate.asts.items.iterate = function(callback) {
    this.Items.forEach(callback);
};

yate.asts.items.iterateBack = function(callback) {
    this.Items.reverse().forEach(callback);
};

yate.asts.items.grep = function(callback) {
    return this.Items.filter(callback);
};

yate.asts.items.map = function(callback) {
    return this.Items.map(callback);
};

//  ---------------------------------------------------------------------------------------------------------------  //

yate.asts.items.code = function(lang, mode) {
    mode = mode || '';

    var result = this._code(lang, mode);
    if (result !== undefined) {
        return result;
    }

    var r = [];
    this.iterate(function(item) {
        r.push( item.code(lang, mode) );
    });

    var sep = this[lang + 'sep__' + mode] || '';

    return r.join(sep);
};

//  ---------------------------------------------------------------------------------------------------------------  //

yate.asts.items.toString = function() {
    if (this.Items.length > 0) {
        var r = this.Items.join('\n').replace(/^/gm, '    ');
        return this.id + ' [\n' + r + '\n]';
    }
    return '';
};

/*
yate.asts.items.toJSON = function() {
    return this.map(function(item) {
        return item.toJSON();
    });
};
*/

//  ---------------------------------------------------------------------------------------------------------------  //

//  FIXME: Из этих трех методов используется только один в одном месте!
yate.asts.items.someIs = function(callback) {
    var items = this.Items;

    if (typeof callback === 'function') {
        for (var i = 0, l = items.length; i < l; i++) {
            if (callback( items[i] )) { return true; }
        }
    } else {
        for (var i = 0, l = items.length; i < l; i++) {
            if ( items[i][callback]() ) { return true; }
        }
    }

    return false;
};

yate.asts.items.allIs = function(callback) {
    var items = this.Items;

    if (typeof callback === 'function') {
        for (var i = 0, l = items.length; i < l; i++) {
            if ( !callback( items[i] ) ) { return false; }
        }
    } else {
        for (var i = 0, l = items.length; i < l; i++) {
            if ( !items[i][callback]() ) { return false; }
        }
    }

    return true;
};

yate.asts.items.noneIs = function(callback) {
    var items = this.Items;

    if (typeof callback === 'function') {
        for (var i = 0, l = items.length; i < l; i++) {
            if ( callback( items[i] ) ) { return false; }
        }
    } else {
        for (var i = 0, l = items.length; i < l; i++) {
            if ( items[i][callback]() ) { return false; }
        }
    }

    return true;
};

//  ---------------------------------------------------------------------------------------------------------------  //

yate.asts.items.apply = function(callback, params) {
    var items = this.Items;
    for (var i = 0, l = items.length; i < l; i++) {
        callback(items[i], params);
    }
};

yate.asts.items.walkdo = function(callback, params, pKey, pObject) {
    var items = this.Items;
    for (var i = 0, l = items.length; i < l; i++) {
        items[i].walkdo(callback, params, i, items);
    }

    callback(this, params, pKey, pObject);
};

yate.asts.items.dowalk = function(callback, params) {
    callback(this, params);

    var items = this.Items;
    for (var i = 0, l = items.length; i < l; i++) {
        items[i].dowalk(callback, params, i, items);
    }
};

yate.asts.items.mergeWith = function(ast) {
    this.Items = ast.p.Items.concat(this.Items);
};

//  ---------------------------------------------------------------------------------------------------------------  //

yate.asts.items._getType = function() {
    var items = this.Items;
    var l = items.length;

    if (!l) { return 'scalar'; } // FIXME: А нужно ли это? Может быть UNDEF сработает?

    var currentId = items[0].id;
    var currentType = items[0].getType();

    for (var i = 1; i < l; i++) {
        var item = items[i];
        var nextType = item.getType();

        var commonType = yate.types.joinType(currentType, nextType);
        if (commonType == 'none') {
            item.error('Несовместимые типы ' + currentType + ' (' + currentId + ') и ' + nextType + ' (' + item.id + ')');
        }
        currentId = item.id;
        currentType = commonType;
    }

    return currentType;
};

//  ---------------------------------------------------------------------------------------------------------------  //

yate.asts.items.toResult = function(result) {
    this.iterate(function(item) {
        item.toResult(result);
    });
};

//  ---------------------------------------------------------------------------------------------------------------  //

yate.asts.items.oncast = function(to) {
    this.iterate(function(item) {
        item.cast(to);
    });
};

//  ---------------------------------------------------------------------------------------------------------------  //

yate.asts.items.isLocal = function() {
    return this.someIs('isLocal');
};

yate.asts.items.isConst = function() {
    return this.allIs('isConst');
};

//  ---------------------------------------------------------------------------------------------------------------  //

yate.asts.items.getScope = function() {
    var items = this.Items;
    var l = items.length;
    if (!l) { return this.scope; }

    var scope = items[0].getScope();
    for (var i = 1; i < l; i++) {
        scope = yate.Scope.commonScope( scope, items[i].getScope() );
    }

    return scope;
};


//  ---------------------------------------------------------------------------------------------------------------  //
//  module
//  ---------------------------------------------------------------------------------------------------------------  //

yate.asts.module = {};

yate.asts.module.options = {
    props: 'Name Block'
};

//  ---------------------------------------------------------------------------------------------------------------  //
//
//  block and body:
//
//    * body
//    * block
//        * block_imports
//        * block_defs
//        * block_templates
//        * block_exprs
//
//  ---------------------------------------------------------------------------------------------------------------  //


//  ---------------------------------------------------------------------------------------------------------------  //
//  body
//  ---------------------------------------------------------------------------------------------------------------  //

yate.asts.body = {};

yate.asts.body.options = {
    props: 'Block'
};

yate.asts.body._getType = function() {
    return this.Block.getType();
};

yate.asts.body.closes = function() {
    return this.Block.closes();
};

yate.asts.body.oncast = function(to) {
    this.Block.cast(to);
};

yate.asts.body.setPrevOpened = function(prevOpened) {
    this.Block.setPrevOpened(prevOpened);
};

yate.asts.body.isLocal = function() {
    return this.Block.isLocal();
};

yate.asts.body.inline = function() {
    return this.Block.inline();
};

yate.asts.body.setAsList = function() {
    this.f.AsList = true;
    this.Block.setAsList();
};

//  ---------------------------------------------------------------------------------------------------------------  //
//  block
//  ---------------------------------------------------------------------------------------------------------------  //

yate.asts.block = {};

yate.asts.block.options = {
    props: 'Defs Templates Exprs',

    scope: true
};

yate.asts.block._init = function() {

    //  Хранилище всего содержимого блока. Заполняется при парсинге.
    //  FIXME: А нужно же удалить эти Items после того,
    //  как мы разложили все по кучкам.
    this.Items = this.make('block_items');

    //  После парсинга все элементы блока раскладываются на отдельные кучки.
    //  p.Includes = this.make('block_includes');
    //  p.Imports = this.make('block_imports');
    this.Defs = this.make('block_defs');
    this.Templates = this.make('block_templates');
    this.Exprs = this.make('block_exprs');
};

yate.asts.block._getType = function() {
    return this.Exprs.getType();
};

yate.asts.block.w_setTypes = function() {
    if (this.f.AsList) {
        this.Exprs.iterate(function(item) {
            if (item.getType() === 'nodeset') {
                item.cast('scalar');
            } else {
                item.cast();
            }
        });
    }
};

yate.asts.block.w_deinclude = function() {
    var a = [];

    this.Items.iterate(function(item) {
        if (item.id === 'include') {
            var ast = yate.parse(item.p.Filename, 'module');
            ast.dowalk(function(ast) {
                ast.w_deinclude();
            });
            a = a.concat(ast.p.Block.p.Items.p.Items);
        } else {
            a.push(item);
        }
    });

    this.Items.p.Items = a;
};

yate.asts.block.w_deimport = function() {
    var a = [];
    var imports = [];

    this.Items.iterate(function(item) {
        if (item.id === 'import') {
            var name = item.p.Name;
            var module = yate.modules[name];
            if (!module) {
                item.error('Cannot find module "' + name + '"');
            }

            imports.push(name);

            var defs = module.defs;
            var input = new pt.InputStream( { filename: module.filename } );

            var b = [];
            for (var i = 0, l = defs.length; i < l; i++) {
                var def = defs[i];
                var ast = yate.AST.fromJSON(def, input);
                ast.f.isImported = true;
                b.push(ast);

                switch (ast.id) {
                    case 'var_':
                        ast.state.vid = ast.p.Id + 1;
                        break;
                    case 'function_':
                        ast.state.fid = ast.p.Id + 1;
                        break;
                    case 'key':
                        ast.state.kid = ast.p.Id + 1;
                }
            }
            a = b.concat(a);

        } else {
            a.push(item);
        }
    });

    this.Items.p.Items = a;
    this.Imports = JSON.stringify(imports);
};

yate.asts.block.w_deitemize = function() {
    var Defs = this.Defs;
    var Templates = this.Templates;
    var Exprs = this.Exprs;

    //  FIXME: Без этой проверки каким-то образом этот код вызывается повторно.
    if (this.Items) {
        this.Items.iterate(function(item) {
            switch (item.id) {
                case 'template':
                    Templates.add(item);
                    break;

                case 'key':
                case 'function_':
                case 'var_':
                case 'external':
                    Defs.add(item);
                    break;

                default:
                    Exprs.add(item);
            }

        });

        this.Items = null;
    }
};

yate.asts.block.oncast = function(to) {
    this.Exprs.cast(to);
};

yate.asts.block.closes = function() {
    //  FIXME: Может таки унести это в block_exprs.closes?
    var exprs = this.Exprs;
    if ( exprs.empty() ) { return false; }

    return exprs.first().closes();
};

yate.asts.block.setPrevOpened = function(prevOpened) {
    this.prevOpened = prevOpened;
};

yate.asts.block.mergeWith = function(block) {
    this.Imports.mergeWith(block.p.Imports);
    this.Defs.mergeWith(block.p.Defs);
    this.Templates.mergeWith(block.p.Templates);
    this.Exprs.mergeWith(block.p.Exprs);
};

yate.asts.block.isLocal = function() {
    return this.Exprs.isLocal();
};

yate.asts.block.inline = function() {
    return (
        this.Templates.empty() &&
        !this.scope.defs.length &&
        this.Exprs.length() === 1 &&
        this.Exprs.first().inline()
    );
};

yate.asts.block.js__matcher = function() {
    //  Группируем шаблоны по модам.
    var groups = {};
    this.Templates.iterate(function(template) {
        var mode = template.p.Mode.p.Value;

        var info = groups[mode];
        if (!info) {
            info = groups[mode] = {
                templates: [],
                matcher: {}
            };
        }

        info.templates.push(template);
        var steps = template.p.Selectors.getLastSteps();
        for (var i = 0, l = steps.length; i < l; i++) {
            var step = steps[i];
            if ( !info.matcher[step] ) {
                info.matcher[step] = [];
            }
        }
    });

    //  В groups у нас получается такая структура.
    //  На верхнем уровне объект, ключами в котором -- моды.
    //  Значения -- объект с двумя полями:
    //
    //    * templates -- линейный список всех шаблонов с такой модой
    //    * matcher -- объект, который станет куском глобального matcher'а.
    //      в нем ключи -- это имена нод, а значениями пока что пустые массивы.
    //      Дальнейший код разложит шаблоны по этим пустым массивам.
    //

    var matcher = {};

    for (var mode in groups) {
        var info = groups[mode];

        var templates = info.templates;
        for (var i = 0, l = templates.length; i < l; i++) {
            var template = templates[i];
            var tid = 't' + template.p.Id;

            var steps = template.p.Selectors.getLastSteps();
            for (var j = 0, m = steps.length; j < m; j++) {
                var step = steps[j];
                info.matcher[step].unshift(tid);
                if (step === '*') {
                    for (var name in info.matcher) {
                        if (name !== '*' && name !== '') {
                            info.matcher[name].unshift(tid);
                        }
                    }
                }
            }
        }
        matcher[mode] = info.matcher;
    }

    return JSON.stringify(matcher, null, 4);
};

yate.asts.block.js__defs = function() {
    var defs = this.scope.defs;
    var r = [];
    for (var i = 0, l = defs.length; i < l; i++) {
        r.push( defs[i].js('defs') );
    }
    return r.join('\n\n');
};

yate.asts.block.setAsList = function() {
    this.f.AsList = true;
    this.Exprs.iterate(function(item) {
        item.setAsList();
    });
};

//  ---------------------------------------------------------------------------------------------------------------  //
//  block_items
//  ---------------------------------------------------------------------------------------------------------------  //

yate.asts.block_items = {};

yate.asts.block_items.options = {
    mixin: 'items'
};

yate.asts.block_items.yatesep__ = '\n';

/*
//  FIXME: Сделать инденты при выводе.
yate.asts.block_items.yate__ = function() {
    var exprs = [];
    var indent = 0;

    // XML indents

    this.iterate(function(expr) {
        var delta = 0;
        if (expr.is('xml_line')) {
            expr.iterate(function(item) {
                if (item.is('xml_start')) {
                    delta++;
                } else if (item.is('xml_end')) {
                    delta--;
                }
            });
        }
        if (delta < 0) indent--;
        exprs.push( expr.yate().replace(/^/gm, Array(indent + 1).join('    ')) );
        if (delta > 0) indent++;
    });

    return exprs.join('\n');
};
*/

//  ---------------------------------------------------------------------------------------------------------------  //
//  block_imports
//  ---------------------------------------------------------------------------------------------------------------  //

/*
yate.asts.block_imports = {};

yate.asts.block_imports.options = {
    mixin: 'items'
};

yate.asts.block_imports.jssep__ = ', ';
*/

//  ---------------------------------------------------------------------------------------------------------------  //
//  block_includes
//  ---------------------------------------------------------------------------------------------------------------  //

yate.asts.block_includes = {};

yate.asts.block_includes.options = {
    mixin: 'items'
};


//  ---------------------------------------------------------------------------------------------------------------  //
//  block_defs
//  ---------------------------------------------------------------------------------------------------------------  //

yate.asts.block_defs = {};

yate.asts.block_defs.options = {
    mixin: 'items'
};

yate.asts.block_defs.jssep__global_def = '\n';

yate.asts.block_defs.yatesep__ = '\n';


//  ---------------------------------------------------------------------------------------------------------------  //
//  block_templates
//  ---------------------------------------------------------------------------------------------------------------  //

yate.asts.block_templates = {};

yate.asts.block_templates.options = {
    mixin: 'items'
};

yate.asts.block_templates.jssep__ = '\n\n';

yate.asts.block_templates.jssep__defs = '\n\n';

yate.asts.block_templates.yatesep__ = '\n\n';


//  ---------------------------------------------------------------------------------------------------------------  //
//  block_exprs
//  ---------------------------------------------------------------------------------------------------------------  //

yate.asts.block_exprs = {};

yate.asts.block_exprs.options = {
    mixin: 'items'
};

yate.asts.block_exprs.w_validate = function() {
    var opened = [];
    this.iterate(function(item) {
        if (item.is('xml_line') || item.is('block_list')) {
            item.wellFormed(opened);
        }
    });
    if (opened.length > 0) {
        this.error('Невалидный XML в блоке. Ожидается </' + opened[0] + '>');
    }
};

yate.asts.block_exprs.w_prepare = function() {
    if ( this.parent.f.AsList ) { return; }
    if ( this.getType() !== 'xml' && this.AsType !== 'xml' ) { return; }

    var items = this.Items;
    var l = items.length;
    if (!l) { return; }

    var prevOpened = this.parent.prevOpened; // block.prevOpened.

    var o = [];
    for (var i = 0; i < l; i++) {
        var item = items[i];
        var next = items[i + 1];

        if ( item.closes() && (prevOpened !== false) ) {
            o.push( this.make('attrs_close', this) );

            prevOpened = false;
        }

        o.push(item);

        if ( item.opens() && !(next && next.closes()) ) {
            var lastTag = item.lastTag();

            lastTag.open = true;
            o.push( this.make('attrs_open', lastTag) );

            prevOpened = true;
        }

        item.setPrevOpened(prevOpened);
    }

    this.Items = o;
};

yate.asts.block_exprs.jssep__output = '\n';

yate.asts.block_exprs.jssep__listitem = '\n';

//  ---------------------------------------------------------------------------------------------------------------  //


//  ---------------------------------------------------------------------------------------------------------------  //
//
//  declarations:
//
//    * template
//        * template_selectors
//        * template_mode
//    * var_
//    * function_
//    * key
//    * external
//
//  ---------------------------------------------------------------------------------------------------------------  //


//  ---------------------------------------------------------------------------------------------------------------  //
//  template
//  ---------------------------------------------------------------------------------------------------------------  //

yate.asts.template = {};

yate.asts.template.w_action = function() {
    this.Id = this.state.tid++;
};

yate.asts.template.w_setTypes = function() {
    this.Body.cast( this.getType() );
};

yate.asts.template._getType = function() {
    var type = this.Body.getType();
    if (type == 'array' || type == 'object') {
        return type;
    }
    return 'xml';
};


//  ---------------------------------------------------------------------------------------------------------------  //
//  template_selectors
//  ---------------------------------------------------------------------------------------------------------------  //

yate.asts.template_selectors = {};

yate.asts.template_selectors.options = {
    mixin: 'items'
};

yate.asts.template_selectors.getLastSteps = function() {
    var steps = [];
    this.iterate(function(selector) {
        var step = ( selector.isRoot() ) ? '' : selector.lastName();
        if (steps.indexOf(step) === -1) {
            steps.push(step);
        }
    });
    return steps;
};

yate.asts.template_selectors.w_validate = function() {
    this.iterate(function(selector) {
        selector.validateMatch();
    });
};

yate.asts.template_selectors.jssep__template_selector = ', ';
yate.asts.template_selectors.jssep__template_abs = ', ';

yate.asts.template_selectors.yatesep__ = ' | ';


//  ---------------------------------------------------------------------------------------------------------------  //
//  template_mode
//  ---------------------------------------------------------------------------------------------------------------  //

yate.asts.template_mode = {};


//  ---------------------------------------------------------------------------------------------------------------  //
//  var_
//  ---------------------------------------------------------------------------------------------------------------  //

yate.asts.var_ = {};

yate.asts.var_.w_action = function() {
    var vars = this.scope.vars;
    var name = this.Name;

    if (vars[name]) {
        this.error('Повторное определение переменной ' + name);
    }

    if (this.Id === undefined) {
        this.Id = this.state.vid++;
    }
    this.f.IsUser = true;

    /*
    if (!this.scope.parent) { // NOTE: В данный момент все глобальные переменные будут "ленивыми".
                              // FIXME: Делать ленивыми только неконстантные переменные.
        this.f.Lazy = true;
    }
    */

    vars[name] = this;
};

yate.asts.var_._getType = function() {
    return this.Value.getType();
};

yate.asts.var_.w_setTypes = function() {
    this.Value.cast();
};

yate.asts.var_.w_prepare = function() {
    var Value = this.Value;
    //  Выставляем значению переменной специальный флаг.
    if ( Value.inline() ) {
        if (Value.getType() === 'attr') {
            Value.p.Value.f.InlineVarValue = true;
        }
    } else {
        Value.rid();
    }
};

yate.asts.var_.w_extractDefs = function() {
    this.scope.defs.push(this);
};

yate.asts.var_.isConst = function() {
    return this.Value.isConst();
};


//  ---------------------------------------------------------------------------------------------------------------  //
//  function_
//  ---------------------------------------------------------------------------------------------------------------  //

yate.asts.function_ = {};

yate.asts.function_.w_action = function() {
    var functions = this.scope.functions;
    var name = this.Name;

    if (functions[name]) {
        this.error('Повторное определение функции или ключа ' + name);
    }

    if (this.Id === undefined) {
        this.Id = this.state.fid++;
    }
    this.f.IsUser = true;

    functions[name] = this;
};

yate.asts.function_.w_validate = function() {
    if (this.Body.getType() === 'undef') {
        this.error('Undefined type of return value');
    }
};

yate.asts.function_._getType = function() {
    return this.Body.getType();
};

yate.asts.function_.w_setTypes = function() {
    this.Body.cast();
};

yate.asts.function_.w_extractDefs = function() {
    this.scope.defs.push(this);
};

yate.asts.function_.isLocal = function() {
    return this.Body.isLocal();
};


//  ---------------------------------------------------------------------------------------------------------------  //
//  key
//  ---------------------------------------------------------------------------------------------------------------  //

yate.asts.key = {};

yate.asts.key.w_action = function() {
    var functions = this.scope.functions;
    var name = this.Name;

    if (functions[name]) {
        this.error('Повторное определение функции или ключа ' + name);
    }

    if (this.Id === undefined) {
        this.Id = this.state.kid++;
    }
    this.f.IsKey = true;

    functions[name] = this;
};

yate.asts.key.w_validate = function() {
    if ( !this.Nodes.getType('nodeset') ) {
        this.Nodes.error('Nodeset is required');
    }
    var useType = this.Use.getType();
    if (useType !== 'scalar' && useType !== 'nodeset') {
        this.Use.error('Scalar or nodeset is required');
    }
};

yate.asts.key._getType = function() {
    return this.Body.getType();
};

yate.asts.key.w_prepare = function() {
    if (this.Use.getType() !== 'nodeset') {
        this.Use.cast('scalar');
    }
    this.Body.cast();
};

yate.asts.key.w_extractDefs = function() {
    this.scope.defs.push(this);
};


//  ---------------------------------------------------------------------------------------------------------------  //
//  external
//  ---------------------------------------------------------------------------------------------------------------  //

yate.asts.external = {};

yate.asts.external.w_action = function() {
    var functions = this.scope.functions;
    var name = this.Name;

    if (functions[name]) {
        this.error('Повторное определение функции или ключа ' + name);
    }

    this.f.IsExternal = true;

    functions[name] = this;
};

yate.asts.external._getType = function() {
    return this.Type;
};

yate.asts.external.w_extractDefs = function() {
    this.scope.defs.push(this);
};


//  ---------------------------------------------------------------------------------------------------------------  //
//
//  block expressions:
//
//    * if_
//        * elses
//        * else_if
//        * else_
//    * for_
//    * apply
//    * value
//    * subexpr
//    * attr
//    * attrs_close
//    * attrs_open
//    * xml
//
//  ---------------------------------------------------------------------------------------------------------------  //


//  ---------------------------------------------------------------------------------------------------------------  //
//  if
//  ---------------------------------------------------------------------------------------------------------------  //

yate.asts.if_ = {};

yate.asts.if_.options = {
    base: 'expr'
};

yate.asts.if_._init = function() {
    this.Elses = this.make('elses');
};

yate.asts.if_._getType = function() {
    var type = this.Then.getType();
    this.Elses.iterate(function(item) {
        type = yate.types.commonType( type, item.getType() );
    });
    return type;
};

yate.asts.if_.w_setTypes = function() {
    this.Condition.cast('boolean');
    this.Elses.iterate(function(item) {
        if ( item.is('else_if') ) {
            item.p.Condition.cast('boolean');
        }
    });
};

yate.asts.if_.oncast = function(to) {
    this.Then.cast(to);
    this.Elses.iterate(function(item) {
        item.p.Body.cast(to);
    });
};

yate.asts.if_.closes = function() {
    return this.Then.closes() && this.Elses.allIs('closes');
};

yate.asts.if_.setPrevOpened = function(prevOpened) {
    this.Then.setPrevOpened(prevOpened);
    this.Elses.iterate(function(item) {
        item.p.Body.setPrevOpened(prevOpened);
    });
};

yate.asts.if_.isLocal = function() {
    return this.Then.isLocal() || this.Elses.isLocal();
};

yate.asts.if_.setAsList = function() {
    this.f.AsList = true;
    this.Then.setAsList();
    this.Elses.iterate(function(item) {
        item.setAsList();
    });
};


//  ---------------------------------------------------------------------------------------------------------------  //
//  elses
//  ---------------------------------------------------------------------------------------------------------------  //

yate.asts.elses = {};

yate.asts.elses.options = {
    mixin: 'items'
};

yate.asts.elses.jssep__ = ' ';


//  ---------------------------------------------------------------------------------------------------------------  //
//  else_if
//  ---------------------------------------------------------------------------------------------------------------  //

yate.asts.else_if = {};

yate.asts.else_if._getType = function() {
    return this.Body.getType();
};

yate.asts.else_if.closes = function() {
    return this.Body.closes();
};


//  ---------------------------------------------------------------------------------------------------------------  //
//  else_
//  ---------------------------------------------------------------------------------------------------------------  //

yate.asts.else_ = {};

yate.asts.else_._getType = function() {
    return this.Body.getType();
};

yate.asts.else_.closes = function() {
    return this.Body.closes();
};

//  ---------------------------------------------------------------------------------------------------------------  //
//  for_
//  ---------------------------------------------------------------------------------------------------------------  //

yate.asts.for_ = {};

yate.asts.for_.options = {
    base: 'expr'
};

yate.asts.for_._getType = function() {
    var type = this.Body.getType();

    return yate.types.joinType(type, type);
};

yate.asts.for_.oncast = function(to) {
    this.Body.cast(to);
};

yate.asts.for_.w_prepare = function() {
    this.Body.cid();
};

yate.asts.for_.closes = function() {
    return this.Body.closes();
};

yate.asts.for_.setPrevOpened = function(prevOpened) {
    this.Body.setPrevOpened(prevOpened);
};

yate.asts.for_.isLocal = function() {
    return this.Body.isLocal();
};

yate.asts.for_.setAsList = function() {
    this.f.AsList = true;
    this.Body.setAsList();
};

//  ---------------------------------------------------------------------------------------------------------------  //
//  apply
//  ---------------------------------------------------------------------------------------------------------------  //

yate.asts.apply = {};

yate.asts.apply.options = {
    base: 'expr'
};

yate.asts.apply._getType = no.value('xml');

yate.asts.apply.w_validate = function() {
    var Expr = this.Expr;
    if ( !( Expr.getType('nodeset') || Expr.getType('object') || Expr.getType('array') ) ) {
        this.error('Type of expression should be NODESET');
    }
};

yate.asts.apply.w_prepare = function() {
    var Expr = this.Expr;
    if (Expr.id === 'object' || Expr.id === 'array') {
        Expr.rid();
    }
};

yate.asts.apply.closes = no.false;

yate.asts.apply.setAsList = function() {
    this.f.AsList = true;
};

//  ---------------------------------------------------------------------------------------------------------------  //
//  value
//  ---------------------------------------------------------------------------------------------------------------  //

yate.asts.value = {};

yate.asts.value._getType = function() {
    return this.Value.getType();
};

yate.asts.value.oncast = function(to) {
    this.Value.cast(to);
};

yate.asts.value.inline = function() {
    return this.Value.inline();
};

yate.asts.value.closes = function() {
    return this.Value.closes();
};

yate.asts.value.isLocal = function() {
    return this.Value.isLocal();
};

yate.asts.value.isConst = function() {
    return this.Value.isConst();
};

yate.asts.value.setAsList = function() {
    this.f.AsList = true;
};

//  ---------------------------------------------------------------------------------------------------------------  //
//  subexpr
//  ---------------------------------------------------------------------------------------------------------------  //

yate.asts.subexpr = {};

yate.asts.subexpr._getType = function() {
    return this.Block.getType();
};

yate.asts.subexpr.oncast = function(to) {
    this.Block.cast(to);
};

yate.asts.subexpr.closes = function() {
    return this.Block.closes();
};

yate.asts.subexpr.setPrevOpened = function(prevOpened) {
    this.Block.setPrevOpened(prevOpened);
};

yate.asts.subexpr.setAsList = function() {
    this.f.AsList = true;
};

yate.asts.subexpr.w_prepare = function() {
    if (this.f.AsList) {
        this.Block.rid();
    }
};

//  ---------------------------------------------------------------------------------------------------------------  //
//  attr
//  ---------------------------------------------------------------------------------------------------------------  //

yate.asts.attr = {};

yate.asts.attr.options = {
    base: 'xml'
};

yate.asts.attr._getType = no.value('attr');

yate.asts.attr.w_setTypes = function() {
    this.Name.cast('scalar');
    if ( this.Value.getType() !== 'xml' ) {
        //  Приведение через cast не меняет на самом деле тип выражения.
        //  Так что в шаблонах по типу не понять, какой там тип.
        this.AttrType = 'scalar';
        this.Value.cast('scalar');
    } else {
        this.AttrType = 'xml';
        this.Value.cast('xml');
    }
};

yate.asts.attr.w_prepare = function() {
    if ( !this.Value.inline() ) {
        this.Value.rid();
    }
};

yate.asts.attr.closes = no.false;


//  ---------------------------------------------------------------------------------------------------------------  //

yate.asts.attrs_close = {};

yate.asts.attrs_close._getType = no.value('xml');


//  ---------------------------------------------------------------------------------------------------------------  //

yate.asts.attrs_open = {};

yate.asts.attrs_open._init = function(item) {
    this.Name = item.p.Name;
    this.Attrs = item.p.Attrs;
    //  FIXME: По идее, переопределение parent должно происходить в this.make('attrs_open', ...),
    //  но w_setTypes для xml_attr случает раньше этого.
    this.Attrs.parent = this;
    //  FIXME: В правой части, похоже, можно что угодно написать. Нужна ли эта строчка вообще?
    item.p.Attrs = null;
};

yate.asts.attrs_open._getType = no.value('xml');



//  ---------------------------------------------------------------------------------------------------------------  //
//
//  xml:
//
//    * xmw
//    * xml_line
//    * xml_start
//    * xml_end
//    * xml_empty
//    * xml_text
//    * xml_full
//    * xml_attrs
//    * xml_attr
//
//  ---------------------------------------------------------------------------------------------------------------  //


//  ---------------------------------------------------------------------------------------------------------------  //
//  xml
//  ---------------------------------------------------------------------------------------------------------------  //

yate.asts.xml = {};

yate.asts.xml.options = {
    base: 'expr'
};

yate.asts.xml._getType = no.value('xml');


//  ---------------------------------------------------------------------------------------------------------------  //
//  xml_line
//  ---------------------------------------------------------------------------------------------------------------  //

yate.asts.xml_line = {};

yate.asts.xml_line.options = {
    base: 'xml',
    mixin: 'items'
};

yate.asts.xml_line.wellFormed = function(opened) {
    var that = this;

    this.iterate(function(item) {
        if (item.is('xml_start')) {
            opened.push(item.p.Name);
        } else if (item.is('xml_end')) {
            var name = opened.pop();
            if (!name) {
                //  FIXME: Если p.Name === true, будет не очень внятное сообщение об ошибке.
                that.error('Закрывающий тег </' + item.p.Name + '> не был предварительно открыт');
            } else if ( (item.p.Name !== name) && (item.p.Name !== true) ) {
                that.error('Невалидный XML. Ожидается </' + name + '>');
            }
            //  FIXME: Не очень подходящее место для этого действия.
            //  Лучше бы унести это в какой-то .action().
            item.p.Name = name;
        }
    });
};

yate.asts.xml_line.opens = function() {
    return !!this.lastTag();
};

yate.asts.xml_line.lastTag = function() {
    var last = this.last();
    if ( last.is('xml_start') ) {
        return last;
    }
};

yate.asts.xml_line.js__content = function() {
    var items = [];
    this.toResult(items);

    var r = [];
    var s = '';
    for (var i = 0, l = items.length; i < l; i++) {
        var item = items[i];
        if (typeof item == 'string') {
            s += item;
        } else {
            if (s) {
                r.push(s);
                s = '';
            }
            r.push(item); // FIXME: item -> make('string_literal')
        }
    }
    if (s) {
        r.push(s); // FIXME:
    }

    for (var i = 0, l = r.length; i < l; i++) {
        var item = r[i];
        if (typeof item == 'string') {
            r[i] = JSON.stringify(item);
        } else {
            r[i] = item.js();
        }
    }

    return r.join(' + ') || "''"; // FIXME: В случае, когда xml_line состоит из одного, скажем, </img>, должна выводиться хотя бы пустая строка.
};


//  ---------------------------------------------------------------------------------------------------------------  //
//  xml_start
//  ---------------------------------------------------------------------------------------------------------------  //

yate.asts.xml_start = {};

yate.asts.xml_start._init = function(ast) {
    this.Name = ast.Name;
    this.Attrs = ast.Attrs;
};

yate.asts.xml_start.options = {
    base: 'xml'
};

yate.asts.xml_start.toResult = function(result) {
    var name = this.Name;

    result.push('<' + name);
    if (!this.open) {
        this.Attrs.toResult(result);
        result.push( (yate.consts.shortTags[name]) ? '/>' : '>' );
    }
};


//  ---------------------------------------------------------------------------------------------------------------  //
//  xml_end
//  ---------------------------------------------------------------------------------------------------------------  //

yate.asts.xml_end = {};

yate.asts.xml_end.options = {
    base: 'xml'
};

yate.asts.xml_end.w_action = function() {
    if ( yate.consts.shortTags[this.Name] ) {
        this.f.Short = true;
    }
};

yate.asts.xml_end.toResult = function(result) {
    if (!this.f.Short) {
        result.push('</' + this.Name + '>');
    }
};


//  ---------------------------------------------------------------------------------------------------------------  //
//  xml_empty
//  ---------------------------------------------------------------------------------------------------------------  //

yate.asts.xml_empty = {};

yate.asts.xml_empty.options = {
    base: 'xml'
};

yate.asts.xml_empty.toResult = function(result) {
    var name = this.Name;

    result.push('<' + name);
    this.Attrs.toResult(result);
    if ( yate.consts.shortTags[name] ) {
        result.push('/>');
    } else {
        result.push('></' + name + '>');
    }
};


//  ---------------------------------------------------------------------------------------------------------------  //
//  xml_text
//  ---------------------------------------------------------------------------------------------------------------  //

yate.asts.xml_text = {};

yate.asts.xml_text.options = {
    base: 'xml'
};

yate.asts.xml_text.oncast = function(to) {
    this.Text.cast(to);
};

yate.asts.xml_text.toResult = function(result) {
    this.Text.toResult(result);
};


//  ---------------------------------------------------------------------------------------------------------------  //
//  xml_full
//  ---------------------------------------------------------------------------------------------------------------  //

yate.asts.xml_full = {};

yate.asts.xml_full.options = {
    base: 'xml',
    mixin: 'items'
};


//  ---------------------------------------------------------------------------------------------------------------  //
//  xml_attrs
//  ---------------------------------------------------------------------------------------------------------------  //

yate.asts.xml_attrs = {};

yate.asts.xml_attrs.options = {
    mixin: 'items'
};

yate.asts.xml_attrs.jssep__open = ',\n';


//  ---------------------------------------------------------------------------------------------------------------  //
//  xml_attr
//  ---------------------------------------------------------------------------------------------------------------  //

yate.asts.xml_attr = {};

yate.asts.xml_attr.toResult = function(result) {
    result.push(' ' + this.Name + '="');
    this.Value.toResult(result);
    result.push('"');
};

yate.asts.xml_attr.w_prepare = function() {
    if ( !this.parent.parent.is('attrs_open') ) { // FIXME: Как бы не ходить по дереву так уродливо?
        this.Value.cast('attrvalue');
    } else {
        this.Value.cast('scalar');
    }
};



//  ---------------------------------------------------------------------------------------------------------------  //
//
//  inline expressions:
//
//    * inline_expr
//    * inline_op
//    * inline_or
//    * inline_and
//    * inline_eq
//    * inline_rel
//    * inline_add
//    * inline_mul
//    * inline_unary
//    * inline_not
//    * inline_union
//    * inline_number
//    * inline_string
//        * string_literal
//        * string_content
//        * string_expr
//    * inline_subexpr
//    * inline_var
//    * inline_function
//    * inline_internal_function
//    * quote
//    * cast
//    * sort
//
//  ---------------------------------------------------------------------------------------------------------------  //


//  ---------------------------------------------------------------------------------------------------------------  //
//  inline_expr
//  ---------------------------------------------------------------------------------------------------------------  //

yate.asts.inline_expr = {};

yate.asts.inline_expr.options = {
    base: 'expr'
};

yate.asts.inline_expr.toResult = function(result) {
    //  FIXME: А не нужно ли тут еще какого-нибудь условия?
    if (this.mode) {
        result.push( this.make('quote', {
            expr: this,
            mode: this.mode
        }) );
    } else {
        result.push(this);
    }
};

yate.asts.inline_expr.inline = no.true;

yate.asts.inline_expr.closes = function() {
    return ( this.getType() != 'attr' ); // Если тип атрибут, то после него все еще могут быть другие атрибуты.
};

var _needCast = {
    'nodeset-scalar': true,
    'nodeset-xml': true,
    'nodeset-attrvalue': true,
    'nodeset-boolean': true,
    'nodeset-data': true,

    'scalar-xml': true,
    'scalar-attrvalue': true,

    'xml-attrvalue': true,
    'xml-scalar': true,

    'object-nodeset': true,
    'array-nodeset': true
};

yate.asts.inline_expr.w_transform = function() {
    var AsType = this.AsType;

    if ( this.isSimple() && (!AsType || AsType === 'scalar' || AsType === 'boolean') ) {
        return this;
    }

    if ( AsType && needCast( this.getType(), AsType ) ) {
        return this.make( 'cast', { to: AsType, expr: this } );
    }

    return this;

    function needCast(from, to) {
        return _needCast[from + '-' + to];
    }
};


//  ---------------------------------------------------------------------------------------------------------------  //
//  inline_op
//  ---------------------------------------------------------------------------------------------------------------  //

yate.asts.inline_op = {};

yate.asts.inline_op.options = {
    base: 'inline_expr'
};

yate.asts.inline_op.w_setTypes = function() {
    var signature = this.signature;
    if (signature) {
        this.Left.cast(signature.left);
        if (this.Right) {
            this.Right.cast(signature.right);
        }
    }
};

yate.asts.inline_op.isLocal = function() {
    return this.Left.isLocal() || ( this.Right && this.Right.isLocal() );
};

yate.asts.inline_op._getType = function() {
    return this.signature.result;
};

yate.asts.inline_op.getScope = function() {
    var lscope = this.Left.getScope();
    if (this.Right) {
        var rscope = this.Right.getScope();
        return yate.Scope.commonScope(lscope, rscope);
    } else {
        return lscope;
    }
};


//  ---------------------------------------------------------------------------------------------------------------  //
//  inline_or
//  ---------------------------------------------------------------------------------------------------------------  //

yate.asts.inline_or = {};

yate.asts.inline_or.signature = {
    left: 'boolean',
    right: 'boolean',
    result: 'boolean'
};

yate.asts.inline_or.options = {
    base: 'inline_op'
};


//  ---------------------------------------------------------------------------------------------------------------  //
//  inline_and
//  ---------------------------------------------------------------------------------------------------------------  //

yate.asts.inline_and = {};

yate.asts.inline_and.signature = {
    left: 'boolean',
    right: 'boolean',
    result: 'boolean'
};

yate.asts.inline_and.options = {
    base: 'inline_op'
};


//  ---------------------------------------------------------------------------------------------------------------  //
//  inline_eq
//  ---------------------------------------------------------------------------------------------------------------  //

yate.asts.inline_eq = {};

yate.asts.inline_eq.signature = {
    left: 'scalar',
    right: 'scalar',
    result: 'boolean'
};

yate.asts.inline_eq.options = {
    base: 'inline_op'
};

yate.asts.inline_eq.w_setTypes = function() {
    var Left = this.Left;
    var Right = this.Right;

    var lType = Left.getType();
    var rType = Right.getType();

    if (lType === 'boolean' || rType === 'boolean') {
        Left.cast('boolean');
        Right.cast('boolean');
    } else if (lType !== 'nodeset' && rType !== 'nodeset') {
        Left.cast('scalar');
        Right.cast('scalar');
    }
};


//  ---------------------------------------------------------------------------------------------------------------  //
//  inline_rel
//  ---------------------------------------------------------------------------------------------------------------  //

yate.asts.inline_rel = {};

yate.asts.inline_rel.signature = {
    left: 'scalar',
    right: 'scalar',
    result: 'boolean'
};

yate.asts.inline_rel.options = {
    base: 'inline_op'
};


//  ---------------------------------------------------------------------------------------------------------------  //
//  inline_add
//  ---------------------------------------------------------------------------------------------------------------  //

yate.asts.inline_add = {};

yate.asts.inline_add.signature = {
    left: 'scalar',
    right: 'scalar',
    result: 'scalar'
};

yate.asts.inline_add.options = {
    base: 'inline_op'
};


//  ---------------------------------------------------------------------------------------------------------------  //
//  inline_mul
//  ---------------------------------------------------------------------------------------------------------------  //

yate.asts.inline_mul = {};

yate.asts.inline_mul.signature = {
    left: 'scalar',
    right: 'scalar',
    result: 'scalar'
};

yate.asts.inline_mul.options = {
    base: 'inline_op'
};


//  ---------------------------------------------------------------------------------------------------------------  //
//  inline_unary
//  ---------------------------------------------------------------------------------------------------------------  //

yate.asts.inline_unary = {};

yate.asts.inline_unary.signature = {
    left: 'scalar',
    result: 'scalar'
};

yate.asts.inline_unary.options = {
    base: 'inline_op'
};


//  ---------------------------------------------------------------------------------------------------------------  //
//  inline_not
//  ---------------------------------------------------------------------------------------------------------------  //

yate.asts.inline_not = {};

yate.asts.inline_not.signature = {
    left: 'boolean',
    result: 'boolean'
};

yate.asts.inline_not.options = {
    base: 'inline_op'
};


//  ---------------------------------------------------------------------------------------------------------------  //
//  inline_union
//  ---------------------------------------------------------------------------------------------------------------  //

yate.asts.inline_union = {};

yate.asts.inline_union.signature = {
    left: 'nodeset',
    right: 'nodeset',
    result: 'nodeset'
};

yate.asts.inline_union.options = {
    base: 'inline_op'
};


//  ---------------------------------------------------------------------------------------------------------------  //
//  inline_number
//  ---------------------------------------------------------------------------------------------------------------  //

yate.asts.inline_number = {};

yate.asts.inline_number.options = {
    base: 'inline_expr'
};

yate.asts.inline_number.isLocal = no.false;

yate.asts.inline_number.isConst = no.true;

yate.asts.inline_number._getType = no.value('scalar');


//  ---------------------------------------------------------------------------------------------------------------  //
//  inline_string
//  ---------------------------------------------------------------------------------------------------------------  //

yate.asts.inline_string = {};

yate.asts.inline_string.options = {
    base: 'inline_expr'
};

yate.asts.inline_string._getType = no.value('scalar');

yate.asts.inline_string.oncast = function(to) {
    this.Value.cast(to);

    //  FIXME: WTF?
    return false;
};

yate.asts.inline_string.toResult = function(result) {
    this.Value.toResult(result);
};

yate.asts.inline_string.asString = function() {
    var s = '';

    this.Value.iterate(function(item) {
        s += item.asString();
    });

    return s;
};

yate.asts.inline_string.isConst = function() {
    return this.Value.isConst();
};

yate.asts.inline_string.isLocal = function() {
    return this.Value.isLocal();
};


//  ---------------------------------------------------------------------------------------------------------------  //
//  string_content
//  ---------------------------------------------------------------------------------------------------------------  //

yate.asts.string_content = {};

yate.asts.string_content.options = {
    mixin: 'items'
};

yate.asts.string_content._getType = no.value('scalar');

yate.asts.string_content.jssep__ = ' + ';


//  ---------------------------------------------------------------------------------------------------------------  //
//  string_expr
//  ---------------------------------------------------------------------------------------------------------------  //

yate.asts.string_expr = {};

yate.asts.string_expr.options = {
    base: 'inline_expr'
};

yate.asts.string_expr._init = function(ast) {
    this.Expr = ast.Expr;
};

yate.asts.string_expr._getType = function() {
    return this.Expr.getType();
};

yate.asts.string_expr.isLocal = function() {
    return this.Expr.isLocal();
};


//  ---------------------------------------------------------------------------------------------------------------  //
//  string_literal
//  ---------------------------------------------------------------------------------------------------------------  //

yate.asts.string_literal = {};

yate.asts.string_literal.w_action = function() {
    this.Value = deentitify(this.Value);
};

yate.asts.string_literal.options = {
    base: 'inline_expr'
};

yate.asts.string_literal._init = function(ast) {
    this.Value = ast.Value;
};

// Чтобы при выводе не отрезались начальные и конечные пробелы.
// См. codegen.js
yate.asts.string_literal.yate = function() {
    return this.Value;
};

yate.asts.string_literal._getType = no.value('scalar');

yate.asts.string_literal.oncast = function(to) {
    if (to === 'attrvalue') {
        this.Value = yr.text2attr(this.Value);
    } else if (to === 'xml') {
        this.Value = yr.text2xml(this.Value);
    }

    return false;
};

yate.asts.string_literal.stringify = function() {
    return JSON.stringify(this.Value);
};

yate.asts.string_literal.asString = function() {
    return this.Value;
};

yate.asts.string_literal.isConst = no.true;

yate.asts.string_literal.isLocal = no.false;


//  ---------------------------------------------------------------------------------------------------------------  //
//  inline_subexpr
//  ---------------------------------------------------------------------------------------------------------------  //

yate.asts.inline_subexpr = {};

yate.asts.inline_subexpr.options = {
    base: 'inline_expr'
};

yate.asts.inline_subexpr.isLocal = function() {
    return this.Expr.isLocal();
};

yate.asts.inline_subexpr._getType = function() {
    return this.Expr.getType();
};


//  ---------------------------------------------------------------------------------------------------------------  //
//  inline_var
//  ---------------------------------------------------------------------------------------------------------------  //

yate.asts.inline_var = {};

yate.asts.inline_var.options = {
    base: 'inline_expr'
};

yate.asts.inline_var.w_action = function() {
    var def = this.def = this.scope.findVar(this.Name);
    if (!def) {
        this.error('Undefined variable ' + this.Name);
    }

    this.Id = def.p.Id;
};

yate.asts.inline_var._getType = function() {
    return this.def.getType();
};

yate.asts.inline_var.isLocal = no.false;

yate.asts.inline_var.getScope = function() {
    // return this.def.scope; // FIXME: В этот момент метод action еще не отработал, видимо, нужно action выполнять снизу-вверх.
    return this.scope.findVar(this.Name).scope;
};


//  ---------------------------------------------------------------------------------------------------------------  //
//  inline_function
//  ---------------------------------------------------------------------------------------------------------------  //

yate.asts.inline_function = {};

yate.asts.inline_function.options = {
    base: 'inline_expr'
};

yate.asts.inline_function._getType = function() {
    var def = this.def;
    if (def.f.IsInternal) {
        return this.signature.type;
    }

    return def.getType();
};

yate.asts.inline_function.w_action = function() {
    var name = this.Name;

    //  Ищем функцию в scope'ах.
    var def = this.scope.findFunction(name);

    if (!def) {
        //  Ищем среди внутренних функций.
        def = internalFunctions[name];

        //  Среди уже инстанцированных нет, смотрим, есть ли определение для внутренней функции.
        var params;
        if ( !def && (( params = yate.consts.internalFunctions[name] )) ) {
            //  Если есть, создаем ее.
            params = {
                signatures: (params instanceof Array) ? params : [ params ],
                name: name
            };
            def = internalFunctions[name] = this.make('inline_internal_function', params);
        }
    }

    if (!def) {
        this.error('Undefined function ' + name);
    }

    this.def = def;

    if (def.f.IsExternal) {
        this.f.IsExternal = true;
    } else if (def.f.IsUser) {
        this.Id = def.p.Id;
        this.f.IsUser = true;
    } else if (def.f.IsKey) {
        this.Id = def.p.Id;
        this.f.IsKey = true;
    } else {
        this.signature = def.findSignature(this.Args.p.Items);
        if (!this.signature) {
            this.error('Cannot find signature for this arguments');
        }
    }
};

yate.asts.inline_function.w_prepare = function() {
    var def = this.def;
    var args = this.Args;

    if (def.f.IsExternal) {
        var argTypes = def.p.ArgTypes;
        args.iterate(function(arg, i) {
            arg.cast( argTypes[i] || 'scalar' );
        });

    } else if (def.f.IsKey) {
        var type = args.first().getType();
        if (type !== 'nodeset') {
            args.first().cast('scalar');
        }

    } else if (def.f.IsInternal) {
        var signature = this.signature;
        var types = signature.args;
        var defType = signature.defType;
        args.iterate(function(arg, i) {
            arg.cast( types[i] || defType );
        });

    } else if (def.f.IsUser) {
        var defArgs = def.p.Args.p.Items;
        args.iterate(function(arg, i) {
            arg.cast( defArgs[i].p.Typedef || 'scalar' );
        });

    }
};

yate.asts.inline_function.getScope = function() {
    //  Если в предикате используется вызов функции,
    //  то определение этого jpath'а нужно выводить в этом же scope.
    //  См. ../tests/functions.18.yate
    return this.scope;
};

yate.asts.inline_function.isLocal = function() {
    if (this.def.f.IsInternal) {
        if (this.signature.local) {
            return true;
        }

        return this.Args.someIs('isLocal');
        /*
        var args = this.Args.p;
        for (var i = 0, l = args.length; i < l; i++) {
            if ( args[i].isLocal() ) { return true; }
        }
        return false;
        */
    }

    if (this.f.IsExternal || this.f.IsKey) {
        return this.Args.someIs('isLocal');
        /*
        var args = this.Args.p;
        for (var i = 0, l = args.length; i < l; i++) {
            if ( args[i].isLocal() ) { return true; }
        }
        return false;
        */
    }

    return this.def.isLocal();
};

yate.asts.inline_function.js__internal = function() {
    var signature = this.signature;
    this.Signature = signature.args.join(',');
    return yate.AST.js.generate('internal_function_' + this.Name, this);
};


//  ---------------------------------------------------------------------------------------------------------------  //
//  inline_internal_function
//  ---------------------------------------------------------------------------------------------------------------  //

//  Сюда будем складывать инстансы inline_internal_function.
//  Определения для них лежат в consts.js, а создаются они в inline_function.action.
var internalFunctions = {};

yate.asts.inline_internal_function = {};

yate.asts.inline_internal_function._init = function(params) {
    this.Name = params.name;
    var signatures = this.signatures = params.signatures;
    for (var i = 0, l = signatures.length; i < l; i++) {
        prepareSignature( signatures[i] );
    }
    this.f.IsInternal = true;

    function prepareSignature(signature) {
        var args = signature.args = signature.args || [];
        for (var i = 0, l = args.length; i < l; i++) {
            var arg = args[i];
            if ( arg.substr(0, 3) === '...' ) {
                args[i] = arg.substr(3);

                signature.defType = args[i];
            }
        }
    }
};

yate.asts.inline_internal_function.findSignature = function(callargs) {
    var signatures = this.signatures;

    for (var i = 0, l = signatures.length; i < l; i++) {
        var signature = signatures[i];
        //  Смотрим, подходят ли переданные аргументы под одну из сигнатур.
        if ( checkArgs(signature, callargs) ) {
            return signature;
        }
    }

    function checkArgs(signature, callargs) {
        var args = signature.args;
        var defType = signature.defType;

        for (var i = 0, l = callargs.length; i < l; i++) {
            var callarg = callargs[i];
            var arg = args[i] || defType;

            //  Для каждого переданного аргумента должен быть
            //      а) формальный аргумент
            //      б) тип переданного аргумента должен приводиться к типу формального.
            if ( !arg || !yate.types.convertable( callarg.getType(), arg ) ) {
                return false;
            }
        }

        return true;
    }
};


//  ---------------------------------------------------------------------------------------------------------------  //
//  quote
//  ---------------------------------------------------------------------------------------------------------------  //

yate.asts.quote = {};

yate.asts.quote.options = {
    base: 'inline_expr'
};

yate.asts.quote._init = function(params) {
    this.Expr = params.expr;
    this.Mode = params.mode;
};


//  ---------------------------------------------------------------------------------------------------------------  //
//  cast
//  ---------------------------------------------------------------------------------------------------------------  //

yate.asts.cast = {};

yate.asts.cast.options = {
    base: 'inline_expr'
};

yate.asts.cast._init = function(params) {
    var to = params.to;
    var expr = params.expr;

    this.From = expr.getType();
    this.To = to;
    this.Expr = expr;
    this.mode = expr.mode;
};

yate.asts.cast._getType = function() {
    return this.To;
};

yate.asts.cast.isLocal = function() {
    return this.Expr.isLocal();
};


//  ---------------------------------------------------------------------------------------------------------------  //
//  sort
//  ---------------------------------------------------------------------------------------------------------------  //

yate.asts.sort = {};

yate.asts.sort.options = {
    base: 'inline_expr'
};

yate.asts.sort._getType = no.value('nodeset');

yate.asts.sort.w_validate = function() {
    if (this.Nodes.getType() !== 'nodeset') {
        this.Nodes.error('Type should be nodeset.');
    }
};

yate.asts.sort.w_prepare = function() {
    this.By.cast('scalar');
};



//  ---------------------------------------------------------------------------------------------------------------  //
//
//  jpath:
//
//    * jpath
//    * jpath_steps
//    * jpath_dors
//    * jpath_predicate
//    * jpath_filter
//    * simple_jpath
//
//  ---------------------------------------------------------------------------------------------------------------  //


//  ---------------------------------------------------------------------------------------------------------------  //
//  jpath
//  ---------------------------------------------------------------------------------------------------------------  //

yate.asts.jpath = {};

yate.asts.jpath.options = {
    base: 'inline_expr'
};

yate.asts.jpath._getType = no.value('nodeset');

yate.asts.jpath.isLocal = function() {
    return !this.Abs;
};

yate.asts.jpath.w_action = function() {
    if ( this.isSimple() ) {
        this.f.IsSimple = true;
        this.Name = this.Steps.first().p.Name;
    }
};

yate.asts.jpath.isSimple = function() {
    var steps = this.Steps;
    return ( steps.length() === 1 && steps.first().is('jpath_nametest') );
};

yate.asts.jpath.isRoot = function() {
    return this.Abs && this.Steps.empty();
};

yate.asts.jpath.w_validate = function() {
    var context = this.Context;
    if ( context && !context.getType('nodeset') ) {
        context.error('Invalid type. Should be NODESET');
    }
};

yate.asts.jpath.validateMatch = function() {
    var steps = this.Steps.p;
    for (var i = 0, l = steps.length; i < l; i++) {
        var step = steps[i];
        if ( step.is('jpath_dots') ) {
            step.error('You can\'t use parent axis in match');
        }
        if ( step.is('jpath_predicate') && !step.isMatchable() ) {
            step.error('You can\'t use index in match');
        }
    }
};

// oncast = function() {},

// Возвращаем значение последнего nametest'а или же ''.
// Например, lastName(/foo/bar[id]) == 'bar', lastName(/) == ''.
yate.asts.jpath.lastName = function() { // FIXME: Унести это в jpath_steps?
    var steps = this.Steps.p.Items;
    for (var i = steps.length; i--; ) {
        var step = steps[i];
        if ( step.is('jpath_nametest') ) {
            return step.p.Name;
        }
    }
    return '';
};

yate.asts.jpath.getScope = function() {
    return this.Steps.getScope();
};

yate.asts.jpath.w_extractDefs = function() {
    //  Каноническая запись jpath.
    var key = this.yate();

    var state = this.state;
    //  scope, в котором этот jpath имеет смысл.
    //  Например, .foo.bar[ .count > a + b ] имеет смысл только внутри scope'а,
    //  в котором определены переменные a и b.
    var scope = this.getScope();

    //  Если этот jpath еще не хранится в scope, то добаляем его туда.
    var jid = scope.jkeys[key];
    if (jid === undefined) {
        jid = scope.jkeys[key] = state.jid++;
        scope.defs.push(this);
    }

    //  Запоминаем id-шник.
    this.Id = jid;
    this.Key = key;
};


//  ---------------------------------------------------------------------------------------------------------------  //
//  jpath_steps
//  ---------------------------------------------------------------------------------------------------------------  //

yate.asts.jpath_steps = {};

yate.asts.jpath_steps.options = {
    mixin: 'items'
};

yate.asts.jpath_steps.jssep__ = ', ';


//  ---------------------------------------------------------------------------------------------------------------  //
//  jpath_dots
//  ---------------------------------------------------------------------------------------------------------------  //

yate.asts.jpath_dots = {};

yate.asts.jpath_dots.w_action = function() {
    this.Length = this.Dots.length - 1;
};


//  ---------------------------------------------------------------------------------------------------------------  //
//  jpath_predicate
//  ---------------------------------------------------------------------------------------------------------------  //

yate.asts.jpath_predicate = {};

yate.asts.jpath_predicate.getScope = function() {
    if ( this.isLocal() ) {
        return this.Expr.getScope();
    } else {
        //  FIXME: Временный костыль. Выражение .item[ /.index ] должно быть индексом,
        //  но из-за того, что оно глобальное, оно уезжает в глобальный scope.
        //  А индексы у меня сейчас не предусмотрены глобальные, т.к. там выражение
        //  явно генерится, без функциональной обертки.
        return this.scope;
    }
};

yate.asts.jpath_predicate.isLocal = function() {
    return this.Expr.isLocal();
};

yate.asts.jpath_predicate.isMatchable = function() {
    return this.Expr.isLocal() || this.Expr.getType() === 'boolean';
};

yate.asts.jpath_predicate.w_setTypes = function() {
    if (this.isLocal() || this.Expr.getType() === 'boolean') {
        //  .items[ .count ] -- Expr является значением, зависящим от контекста. Это предикат.
        this.Expr.cast('boolean');
    } else {
        //  .items[ count ] -- Expr не зависит от контекста. Это индекс.
        this.Expr.cast('scalar');
    }
};

yate.asts.jpath_predicate.w_extractDefs = function() {
    //  Каноническая запись предиката.
    var key = this.Expr.yate();

    var state = this.state;
    //  См. примечание в jpath.action().
    var scope = this.getScope();

    //  Если этот predicate еще не хранится в scope, то добаляем его туда.
    var pid = scope.pkeys[key];
    if (!pid) {
        pid = scope.pkeys[key] = state.pid++;
        scope.defs.push(this);
    }

    //  Запоминаем id-шник.
    this.Id = pid;
    this.Key = key;
};


//  ---------------------------------------------------------------------------------------------------------------  //
//  jpath_filter
//  ---------------------------------------------------------------------------------------------------------------  //

yate.asts.jpath_filter = {};

yate.asts.jpath_filter.options = {
    base: 'inline_expr'
};

yate.asts.jpath_filter._init = function(params) {
    if (params) {
        this.Expr = params.expr;
        this.JPath = params.jpath;
    }
};

yate.asts.jpath_filter._getType = no.value('nodeset');

yate.asts.jpath_filter.isLocal = function() {
    return this.Expr.isLocal() || this.JPath.isLocal();
};

yate.asts.jpath_filter.getScope = function() {
    return yate.Scope.commonScope( this.Expr.getScope(), this.JPath.getScope() );
};

yate.asts.jpath_filter.w_prepare = function() {
    this.Expr.cast('nodeset');
};

yate.asts.jpath_filter.w_validate = function() {
    if ( !this.Expr.getType('nodeset') ) {
        this.Expr.error('Type should be NODESET');
    }
};


//  ---------------------------------------------------------------------------------------------------------------  //
//  simple_jpath
//  ---------------------------------------------------------------------------------------------------------------  //

yate.asts.simple_jpath = {};

yate.asts.simple_jpath.options = {
    base: 'inline_expr'
};

yate.asts.simple_jpath._getType = no.value('nodeset');

yate.asts.simple_jpath._init = function(jpath) {
    this.JPath = jpath;
    this.Name = jpath.p.Steps.first().p.Name;
};

yate.asts.simple_jpath.isLocal = function() {
    return this.JPath.isLocal();
};

yate.asts.simple_jpath.getScope = function() {
    return this.JPath.getScope();
};



//  ---------------------------------------------------------------------------------------------------------------  //
//
//  arguments:
//
//    * arglist
//    * arglist_item
//    * callargs
//    * callarg
//
//  ---------------------------------------------------------------------------------------------------------------  //


//  ---------------------------------------------------------------------------------------------------------------  //
//  arglist
//  ---------------------------------------------------------------------------------------------------------------  //

yate.asts.arglist = {};

yate.asts.arglist.options = {
    mixin: 'items'
};

yate.asts.arglist.jssep__defaults = '\n';

yate.asts.arglist.yatesep__ = ', ';



//  ---------------------------------------------------------------------------------------------------------------  //
//  arglist_item
//  ---------------------------------------------------------------------------------------------------------------  //

yate.asts.arglist_item = {};

yate.asts.arglist_item.w_action = function() {
    //  FIXME: Очень уж хрупкая конструкция.
    //  NOTE: Смысл в том, что в AST параметры и блок на одном уровне, а отдельный scope создается
    //  только для блока. И аргументы нужно прописывать именно туда.
    var blockScope = this.parent.parent.p.Body.p.Block.scope;
    var vars = blockScope.vars;

    var name = this.Name;
    if ( vars[name] ) {
        this.error('Повторное определение аргумента ' + name);
    }

    vars[name] = this;
    //  Заодно меняем и scope.
    this.scope = blockScope;

    this.Id = this.state.vid++;
};

yate.asts.arglist_item.isConst = no.false;

yate.asts.arglist_item._getType = function() {
    var typedef = this.Typedef;
    switch (typedef) {
        case 'nodeset':
        case 'object':
        case 'array':
        case 'boolean':
        case 'xml':
            return typedef;

        default:
            return 'scalar';
    }
};

yate.asts.arglist_item.w_prepare = function() {
    if (this.Default) {
        this.Default.cast( this.getType() );
    }
};


//  ---------------------------------------------------------------------------------------------------------------  //
//  callargs
//  ---------------------------------------------------------------------------------------------------------------  //

yate.asts.callargs = {};

yate.asts.callargs.options = {
    mixin: 'items'
};

yate.asts.callargs.jssep__ = ', ';

yate.asts.callargs.yatesep__ = ', ';

//  ---------------------------------------------------------------------------------------------------------------  //
//  callarg
//  ---------------------------------------------------------------------------------------------------------------  //

yate.asts.callarg = {};

yate.asts.callarg._getType = function() {
    return this.Expr.getType();
};

yate.asts.callarg.isLocal = function() {
    return this.Expr.isLocal();
};

yate.asts.callarg.oncast = function(to) {
    this.Expr.cast(to);
};



//  ---------------------------------------------------------------------------------------------------------------  //

yate.asts.pair = {};

yate.asts.pair._getType = no.value('pair');

yate.asts.pair.w_setTypes = function() {
    this.Key.cast('scalar');

    var type = this.Value.getType();
    if (type === 'nodeset') {
        this.Value.cast('data');
    } else {
        this.Value.cast(type);
    }
};

yate.asts.pair.w_prepare = function() {
    var value = this.Value;

    if ( !value.inline() ) {
        value.rid();
    }
};

//  ---------------------------------------------------------------------------------------------------------------  //

yate.asts.object = {};

yate.asts.object._getType = no.value('object');

yate.asts.object.w_setTypes = function() {
    this.Block.cast('pair');
};

yate.asts.object.setAsList = function() {
    this.f.AsList = true;
};

yate.asts.object.w_prepare = function() {
    if (this.f.AsList) {
        this.rid();
    }
};

//  ---------------------------------------------------------------------------------------------------------------  //

yate.asts.array = {};

yate.asts.array._getType = no.value('array');

yate.asts.array.w_list = function() {
    this.Block.setAsList();
};

yate.asts.array.setAsList = function() {
    this.f.AsList = true;
};

yate.asts.array.w_prepare = function() {
    if (this.f.AsList) {
        this.rid();
    }
};

//  ---------------------------------------------------------------------------------------------------------------  //

yate.asts.cdata = {};

yate.asts.cdata._getType = no.value('xml');

//  ---------------------------------------------------------------------------------------------------------------  //


