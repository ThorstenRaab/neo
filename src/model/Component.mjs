import Base            from '../core/Base.mjs';
import ClassSystemUtil from '../util/ClassSystem.mjs';
import NeoArray        from '../util/Array.mjs';
import Observable      from '../core/Observable.mjs';

const expressionContentRegex = /\${(.+?)}/g,
      dataVariableRegex      = /data((?!(\.[a-z_]\w*\(\)))\.[a-z_]\w*)+/gi,
      formatterCache         = {};

/**
 * An optional component (view) model for adding bindings to configs
 * @class Neo.model.Component
 * @extends Neo.core.Base
 */
class Component extends Base {
    static getStaticConfig() {return {
        /**
         * True automatically applies the core/Observable.mjs mixin
         * @member {Boolean} observable=true
         * @static
         */
        observable: true
    }}

    static getConfig() {return {
        /**
         * @member {String} className='Neo.model.Component'
         * @protected
         */
        className: 'Neo.model.Component',
        /**
         * @member {String} ntype='component-model'
         * @protected
         */
        ntype: 'component-model',
        /**
         * @member {Object|null} bindings_=null
         * @protected
         */
        bindings_: null,
        /**
         * @member {Boolean} cacheFormatterFunctions=true
         */
        cacheFormatterFunctions: true,
        /**
         * @member {Object|null} data_=null
         */
        data_: null,
        /**
         * @member {Neo.component.Base|null} owner=null
         * @protected
         */
        owner: null,
        /**
         * @member {Object|null} stores_=null
         */
        stores_: null
    }}

    /**
     *
     * @param {Object} config
     */
    constructor(config) {
        Neo.currentWorker.isUsingViewModels = true;
        super(config);
        this.bindings = {};
    }

    /**
     * Adds a given key/value combination on this model level.
     * The method is used by setData() & setDataAtSameLevel()
     * in case the  data property does not exist yet.
     * @param {String} key
     * @param {*} value
     * @private
     */
    addDataProperty(key, value) {
        let me = this,
            dataRoot, keyLeaf, parentScope;

        Neo.ns(key, true, me.data);

        parentScope = me.getParentDataScope(key);
        dataRoot    = parentScope.scope;
        keyLeaf     = parentScope.key;

        dataRoot[keyLeaf] = value;

        me.createDataProperties(me.data, 'data');
    }

    /**
     * Triggered after the data config got changed
     * @param {Object|null} value
     * @param {Object|null} oldValue
     * @protected
     */
    afterSetData(value, oldValue) {
        if (value) {
            this.createDataProperties(value, 'data');
        }
    }

    /**
     * Triggered after the stores config got changed
     * @param {Object|null} value
     * @param {Object|null} oldValue
     * @protected
     */
    afterSetStores(value, oldValue) {
        if (value) {
            console.log('afterSetStores', value);
        }
    }

    /**
     * Triggered when accessing the data config
     * @param {Object} value
     * @protected
     */
    beforeGetData(value) {
        return value || {};
    }

    /**
     * Triggered before the stores config gets changed.
     * @param {Object|null} value
     * @param {Object|null} oldValue
     * @returns {Object|null}
     * @protected
     */
    beforeSetStores(value, oldValue) {
        if (value) {
            Object.entries(value).forEach(([key, storeValue]) => {
                value[key] = ClassSystemUtil.beforeSetInstance(storeValue);
            });
        }

        return value;
    }

    /**
     * Registers a new binding in case a matching data property does exist.
     * Otherwise it will use the closest model with a match.
     * @param {String} componentId
     * @param {String} key
     * @param {String} value
     * @param {String} formatter
     */
    createBinding(componentId, key, value, formatter) {
        let me          = this,
            parentScope = me.getParentDataScope(key),
            data        = parentScope.scope,
            keyLeaf     = parentScope.key,
            bindingScope, parentModel;

        if (data[keyLeaf]) {
            bindingScope = Neo.ns(`${key}.${componentId}`, true, me.bindings);
            bindingScope[value] = formatter;
        } else {
            parentModel = me.getParent();

            if (parentModel) {
                parentModel.createBinding(componentId, key, value, formatter);
            } else {
                console.error('No model.Component found with the specified data property', value);
            }
        }
    }

    /**
     * Registers a new binding in case a matching data property does exist.
     * Otherwise it will use the closest model with a match.
     * @param {String} componentId
     * @param {String} formatter
     * @param {String} value
     */
    createBindingByFormatter(componentId, formatter, value) {
        let me            = this,
            formatterVars = me.getFormatterVariables(formatter),
            data, keyLeaf, parentModel, parentScope;

        formatterVars.forEach(key => {
            parentScope = me.getParentDataScope(key);
            data        = parentScope.scope;
            keyLeaf     = parentScope.key;

            if (data[keyLeaf]) {
                me.createBinding(componentId, key, value, formatter);
            } else {
                parentModel = me.getParent();

                if (parentModel) {
                    parentModel.createBinding(componentId, key, value, formatter);
                } else {
                    console.error('No model.Component found with the specified data property', value);
                }
            }
        });
    }

    /**
     *
     * @param {Neo.component.Base} component
     */
    createBindings(component) {
        Object.entries(component.bind).forEach(([key, value]) => {
            if (!this.isStoreValue(value)) {
                this.createBindingByFormatter(component.id, value, key);
            }
        });
    }

    /**
     *
     * @param {Object} config
     * @param {String} path
     */
    createDataProperties(config, path) {
        let me   = this,
            root = Neo.ns(path, false, me),
            descriptor, keyValue, newPath;

        Object.entries(config).forEach(([key, value]) => {
            if (!key.startsWith('_')) {
                descriptor = Object.getOwnPropertyDescriptor(root, key);
                newPath    = `${path}.${key}`

                if (!(typeof descriptor === 'object' && typeof descriptor.set === 'function')) {
                    keyValue = config[key];
                    me.createDataProperty(key, newPath, root);
                    root[key] = keyValue;
                }

                if (Neo.isObject(value)) {
                    me.createDataProperties(config[key], newPath);
                }
            }
        });
    }

    /**
     *
     * @param {String} key
     * @param {String} path
     * @param {Object} [root=this.data]
     */
    createDataProperty(key, path, root=this.data) {
        let me = this;

        if (path && path.startsWith('data.')) {
            path = path.substring(5);
        }

        Object.defineProperty(root, key, {
            get() {
                return root['_' + key];
            },

            set(value) {
                let _key     = `_${key}`,
                    oldValue = root[_key];

                if (!root[_key]) {
                    Object.defineProperty(root, _key, {
                        enumerable: false,
                        value     : value,
                        writable  : true
                    });
                } else {
                    root[_key] = value;
                }

                if (value !== oldValue) {
                    me.onDataPropertyChange(path ? path : key, value, oldValue);
                }
            }
        });
    }

    /**
     *
     * @param {String} key
     * @param {Neo.model.Component} [originModel=this] for internal usage only
     * @returns {*} value
     */
    getData(key, originModel=this) {
        let me          = this,
            parentScope = me.getParentDataScope(key),
            data        = parentScope.scope,
            keyLeaf     = parentScope.key,
            parentModel;

        if (data.hasOwnProperty(keyLeaf)) {
            return data[keyLeaf];
        }

        parentModel = me.getParent();

        if (!parentModel) {
            console.error(`data property '${key}' does not exist.`, originModel.id);
        }

        return parentModel.getData(key, originModel);
    }

    /**
     * Extracts data variables from a given formatter string
     * @param {String} value
     */
    getFormatterVariables(value) {
        let parts  = value.match(expressionContentRegex) || [],
            result = [],
            dataVars;

        parts.forEach(part => {
            dataVars = part.match(dataVariableRegex) || [];

            dataVars.forEach(variable => {
                NeoArray.add(result, variable.substr(5)); // remove the "data." at the start
            })
        });

        result.sort();

        return result;
    }

    /**
     * Returns the merged data
     * @param {Object} data
     * @returns {Object} data
     */
    getHierarchyData(data=this.getPlainData()) {
        let me     = this,
            parent = me.getParent();

        if (parent) {
            data = {
                ...parent.getHierarchyData(data),
                ...me.getPlainData()
            };
        } else {
            return me.getPlainData();
        }

        return data;
    }

    /**
     * Returns a plain version of this.data.
     * This excludes the property getters & setters.
     * @returns {Object}
     */
    getPlainData() {
        return JSON.parse(JSON.stringify(this.data));
    }

    /**
     * Get the closest model inside the components parent tree
     * @returns {Neo.model.Component|null}
     */
    getParent() {
        let parentId        = this.owner.parentId,
            parentComponent = parentId && Neo.getComponent(parentId);

        return parentComponent && parentComponent.getModel();
    }

    /**
     * Helper method to get the parent namespace for a nested data property via Neo.ns() if needed.
     * @param key
     * @returns {Object}
     */
    getParentDataScope(key) {
        let me      = this,
            keyLeaf = key,
            data    = me.data;

        if (key.includes('.')) {
            key     = key.split('.');
            keyLeaf = key.pop();
            data    = Neo.ns(key.join('.'), false, data);
        }

        return {
            key  : keyLeaf,
            scope: data
        };
    }

    /**
     * Internal convenience method to check if a binding value is supposed to match a store
     * @param {String} value
     * @returns {Boolean}
     */
    isStoreValue(value) {
        return value.startsWith('stores.');
    }

    /**
     *
     * @param {String} key
     * @param {*} value
     * @param {*} oldValue
     */
    onDataPropertyChange(key, value, oldValue) {
        let me      = this,
            binding = me.bindings && me.bindings[key],
            component, config, hierarchyData, model;

        if (binding) {
            hierarchyData = {};

            Object.entries(binding).forEach(([componentId, configObject]) => {
                component = Neo.getComponent(componentId);
                config    = {};
                model     = component.getModel();

                if (!hierarchyData[model.id]) {
                    hierarchyData[model.id] = model.getHierarchyData();
                }

                Object.entries(configObject).forEach(([configField, formatter]) => {
                    // we can not call me.resolveFormatter(), since a data property inside a parent model
                    // could have changed which is relying on data properties inside a closer model
                    config[configField] = model.resolveFormatter(formatter, hierarchyData[model.id]);
                });

                if (component) {
                    component.set(config);
                }
            });
        }

        me.fire('dataPropertyChange', {
            key     : key,
            id      : me.id,
            oldValue: oldValue,
            value   : value
        });
    }

    /**
     * This method will assign binding values at the earliest possible point inside the component lifecycle.
     * It can not store bindings though, since child component ids most likely do not exist yet.
     * @param {Object} [component=this.owner]
     */
    parseConfig(component=this.owner) {
        let me = this;

        if (component.bind) {
            Object.entries(component.bind).forEach(([key, value]) => {
                if (me.isStoreValue(value)) {
                    me.resolveStore(component, key, value.substring(7));
                } else {
                    component[key] = me.resolveFormatter(value);
                }
            });
        }
    }

    /**
     * Removes all bindings for a given component id inside this model
     * as well as inside all parent models.
     * @param {String} componentId
     */
    removeBindings(componentId) {
        let me          = this,
            parentModel = me.getParent();

        Object.entries(me.bindings).forEach(([dataProperty, binding]) => {
            delete binding[componentId];
        });

        if (parentModel) {
            parentModel.removeBindings(componentId);
        }
    }

    /**
     *
     * @param {Neo.component.Base} [component=this.owner]
     */
    resolveBindings(component=this.owner) {
        let me = this;

        if (component.bind) {
            me.createBindings(component);

            Object.entries(component.bind).forEach(([key, value]) => {
                if (!me.isStoreValue(value)) { // bound stores already got resolved inside parseConfig()
                    component[key] = me.resolveFormatter(value);
                }
            });
        }
    }

    /**
     *
     * @param {String} formatter
     * @param {Object} [data=null] optionally pass this.getHierarchyData() for performance reasons
     */
    resolveFormatter(formatter, data=null) {
        let me = this,
            fn;

        if (!data) {
            data = this.getHierarchyData();
        }

        if (me.cacheFormatterFunctions && formatterCache[formatter]) {
            return formatterCache[formatter].call(me, data);
        }

        fn = new Function('data', 'return `' + formatter + '`;');

        if (me.cacheFormatterFunctions) {
            formatterCache[formatter] = fn;
        }

        return fn.call(me, data);
    }

    /**
     *
     * @param {Neo.component.Base} component
     * @param {String} configName
     * @param {String} storeName
     * @param {Neo.model.Component} [originModel=this] for internal usage only
     */
    resolveStore(component, configName, storeName, originModel=this) {
        let me = this,
            parentModel;

        if (!me.stores || !me.stores.hasOwnProperty(storeName)) {
            parentModel = me.getParent();

            if (parentModel) {
                parentModel.resolveStore(component, configName, storeName);
            } else {
                console.error('bound store not found inside this model or parents:', storeName, originModel);
            }
        } else {
            component[configName] = me.stores[storeName];
        }
    }

    /**
     * The method will assign all values to the closest model where it finds an existing key.
     * In case no match is found inside the parent chain, a new data property will get generated.
     * @param {Object|String} key
     * @param {*} value
     * @param {Neo.model.Component} [originModel=this] for internal usage only
     */
    setData(key, value, originModel=this) {
        let me = this,
            data, keyLeaf, parentModel, parentScope;

        if (Neo.isObject(key)) {
            Object.entries(key).forEach(([dataKey, dataValue]) => {
                me.setData(dataKey, dataValue);
            });
        } else {
            parentScope = me.getParentDataScope(key);
            data        = parentScope.scope;
            keyLeaf     = parentScope.key;

            if (data && data.hasOwnProperty(keyLeaf)) {
                data[keyLeaf] = value;
            } else {
                parentModel = me.getParent();

                if (parentModel) {
                    parentModel.setData(key, value, originModel);
                } else {
                    originModel.addDataProperty(key, value);
                }
            }
        }
    }

    /**
     * Use this method instead of setData() in case you want to enforce
     * to set all keys on this instance instead of looking for matches inside parent models.
     * @param {Object|String} key
     * @param {*} value
     */
    setDataAtSameLevel(key, value) {
        let me = this,
            data, keyLeaf, parentScope;

        if (Neo.isObject(key)) {
            Object.entries(key).forEach(([dataKey, dataValue]) => {
                me.setDataAtSameLevel(dataKey, dataValue);
            });
        } else {
            parentScope = me.getParentDataScope(key);
            data        = parentScope.scope;
            keyLeaf     = parentScope.key;

            if (data && data.hasOwnProperty(keyLeaf)) {
                data[keyLeaf] = value;
            } else {
                me.addDataProperty(key, value);
            }
        }
    }
}

Neo.applyClassConfig(Component);

export {Component as default};