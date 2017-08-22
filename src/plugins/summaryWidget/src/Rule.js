define([
    'text!../res/ruleTemplate.html',
    './Condition',
    './input/ColorPalette',
    './input/IconPalette',
    'lodash',
    'zepto'
], function (
    ruleTemplate,
    Condition,
    ColorPalette,
    IconPalette,
    _,
    $
) {

    /**
     * An object representing a summary widget rule. Maintains a set of text
     * and css properties for output, and a set of conditions for configuring
     * when the rule will be applied to the summary widget.
     * @constructor
     * @param {Object} ruleConfig A JavaScript object representing the configuration of this rule
     * @param {Object} domainObject The Summary Widget domain object which contains this rule
     * @param {MCT} openmct An MCT instance
     * @param {ConditionManager} conditionManager A ConditionManager instance
     * @param {WidgetDnD} widgetDnD A WidgetDnD instance to handle dragging and dropping rules
     * @param {element} container The DOM element which cotains this summary widget
     */
    function Rule(ruleConfig, domainObject, openmct, conditionManager, widgetDnD, container) {
        var self = this;

        this.config = ruleConfig;
        this.domainObject = domainObject;
        this.openmct = openmct;
        this.conditionManager = conditionManager;
        this.widgetDnD = widgetDnD;
        this.container = container;

        this.domElement = $(ruleTemplate);
        this.conditions = [];
        this.dragging = false;

        this.remove = this.remove.bind(this);
        this.duplicate = this.duplicate.bind(this);
        this.initCondition = this.initCondition.bind(this);
        this.removeCondition = this.removeCondition.bind(this);
        this.refreshConditions = this.refreshConditions.bind(this);
        this.onConditionChange = this.onConditionChange.bind(this);

        this.thumbnail = $('.t-widget-thumb', this.domElement);
        this.title = $('.rule-title', this.domElement);
        this.description = $('.rule-description', this.domElement);
        this.trigger = $('.t-trigger', this.domElement);
        this.toggleConfigButton = $('.view-control', this.domElement);
        this.configArea = $('.widget-rule-content', this.domElement);
        this.grippy = $('.t-grippy', this.domElement);
        this.conditionArea = $('.t-widget-rule-config', this.domElement);
        this.jsConditionArea = $('.t-rule-js-condition-input-holder', this.domElement);
        this.deleteButton = $('.t-delete', this.domElement);
        this.duplicateButton = $('.t-duplicate', this.domElement);
        this.addConditionButton = $('.add-condition', this.domElement);

        /**
         * The text inputs for this rule: any input included in this object will
         * have the appropriate event handlers registered to it, and it's corresponding
         *field in the domain object will be updated with its value
        */
        this.textInputs = {
            name: $('.t-rule-name-input', this.domElement),
            label: $('.t-rule-label-input', this.domElement),
            message: $('.t-rule-message-input', this.domElement),
            jsCondition: $('.t-rule-js-condition-input', this.domElement)
        };

        //palette inputs for widget output style
        this.iconInput = new IconPalette('', container);
        this.colorInputs = {
            'background-color': new ColorPalette('icon-paint-bucket', container),
            'border-color': new ColorPalette('icon-line-horz', container),
            'color': new ColorPalette('icon-T', container)
        };

        this.colorInputs.color.toggleNullOption();

        //event callback functions supported by this rule
        this.callbacks = {
            remove: [],
            duplicate: [],
            change: [],
            conditionChange: []
        };

        /**
         * An onchange event handler method for this rule's icon palettes
         * @param {string} icon The css class name corresponding to this icon
         * @private
         */
        function onIconInput(icon) {
            self.config.icon = icon;
            self.updateDomainObject();
            self.callbacks.change.forEach(function (callback) {
                if (callback) {
                    callback();
                }
            });
        }

        /**
         * An onchange event handler method for this rule's color palettes palettes
         * @param {string} color The color selected in the palette
         * @param {string} property The css property which this color corresponds to
         * @private
         */
        function onColorInput(color, property) {
            self.config.style[property] = color;
            self.updateDomainObject();
            self.thumbnail.css(property, color);
            self.callbacks.change.forEach(function (callback) {
                if (callback) {
                    callback();
                }
            });
        }

        /**
         * An onchange event handler method for this rule's trigger key
         * @param {event} event The change event from this rule's select element
         * @private
         */
        function onTriggerInput(event) {
            var elem = event.target;
            self.config.trigger = elem.value;
            self.generateDescription();
            self.updateDomainObject();
            self.refreshConditions();
            self.callbacks.conditionChange.forEach(function (callback) {
                if (callback) {
                    callback();
                }
            });
        }

        /**
         * An onchange event handler method for this rule's text inputs
         * @param {element} elem The input element that generated the event
         * @param {string} inputKey The field of this rule's configuration to update
         * @private
         */
        function onTextInput(elem, inputKey) {
            self.config[inputKey] = elem.value;
            self.updateDomainObject();
            if (inputKey === 'name') {
                self.title.html(elem.value);
            }
            self.callbacks.change.forEach(function (callback) {
                if (callback) {
                    callback();
                }
            });
        }

        /**
         * An onchange event handler for a mousedown event that initiates a drag gesture
         * @param {event} event A mouseup event that was registered on this rule's grippy
         * @private
         */
        function onDragStart(event) {
            $('.t-drag-indicator').each(function () {
                $(this).html($('.widget-rule-header', self.domElement).clone().get(0));
            });
            self.widgetDnD.setDragImage($('.widget-rule-header', self.domElement).clone().get(0));
            self.widgetDnD.dragStart(self.config.id);
            self.domElement.hide();
        }
        /**
         * Show or hide this rule's configuration properties
         * @private
         */
        function toggleConfig() {
            self.configArea.toggleClass('expanded');
            self.toggleConfigButton.toggleClass('expanded');
            self.config.expanded = !self.config.expanded;
        }

        $('.t-rule-label-input', this.domElement).before(this.iconInput.getDOM());
        this.iconInput.set(self.config.icon);
        this.iconInput.on('change', function (value) {
            onIconInput(value);
        });

        Object.keys(this.colorInputs).forEach(function (inputKey) {
            var input = self.colorInputs[inputKey];
            input.on('change', function (value) {
                onColorInput(value, inputKey);
            });
            input.set(self.config.style[inputKey]);
            $('.t-style-input', self.domElement).append(input.getDOM());
        });

        Object.keys(this.textInputs).forEach(function (inputKey) {
            self.textInputs[inputKey].prop('value', self.config[inputKey] || '');
            self.textInputs[inputKey].on('input', function () {
                onTextInput(this, inputKey);
            });
        });

        this.deleteButton.on('click', this.remove);
        this.duplicateButton.on('click', this.duplicate);
        this.addConditionButton.on('click', function () {
            self.initCondition();
        });
        this.toggleConfigButton.on('click', toggleConfig);
        this.trigger.on('change', onTriggerInput);

        this.title.html(self.config.name);
        this.description.html(self.config.description);
        this.trigger.prop('value', self.config.trigger);

        this.grippy.on('mousedown', onDragStart);

        if (!this.conditionManager.loadCompleted()) {
            this.config.expanded = false;
        }

        if (!this.config.expanded) {
            this.configArea.removeClass('expanded');
            this.toggleConfigButton.removeClass('expanded');
        }

        if (this.domainObject.configuration.ruleOrder.length === 2) {
            $('.t-grippy', this.domElement).hide();
        }

        this.refreshConditions();

        //if this is the default rule, hide elements that don't apply
        if (this.config.id === 'default') {
            $('.t-delete', this.domElement).hide();
            $('.t-widget-rule-config', this.domElement).hide();
            $('.t-grippy', this.domElement).hide();
        }
    }

    /**
     * Return the DOM element representing this rule
     * @return {Element} A DOM element
     */
    Rule.prototype.getDOM = function () {
        return this.domElement;
    };

    /**
     * Register a callback with this rule: supported callbacks are remove, change,
     * conditionChange, and duplicate
     * @param {string} event The key for the event to listen to
     * @param {function} callback The function that this rule will envoke on this event
     */
    Rule.prototype.on = function (event, callback) {
        if (this.callbacks[event]) {
            this.callbacks[event].push(callback);
        }
    };

    /**
     * An event handler for when a condition's configuration is modified
     * @param {} value
     * @param {string} property The path in the configuration to updateDomainObject
     * @param {number} index The index of the condition that initiated this change
     */
    Rule.prototype.onConditionChange = function (value, property, index) {
        _.set(this.config.conditions[index], property, value);
        this.generateDescription();
        this.updateDomainObject();
        this.callbacks.conditionChange.forEach(function (callback) {
            if (callback) {
                callback();
            }
        });
    };

    /**
     * During a rule drag event, show the placeholder element after this rule
     */
    Rule.prototype.showDragIndicator = function () {
        $('.t-drag-indicator').hide();
        $('.t-drag-indicator', this.domElement).show();
    };

    /**
     * Mutate thet domain object with this rule's local configuration
     */
    Rule.prototype.updateDomainObject = function () {
        this.openmct.objects.mutate(this.domainObject, 'configuration.ruleConfigById.' +
            this.config.id, this.config);
    };

    /**
     * Get a property of this rule by key
     * @param {string} prop They property key of this rule to get
     * @return {} The queried property
     */
    Rule.prototype.getProperty = function (prop) {
        return this.config[prop];
    };

    /**
     * Remove this rule from the domain object's configuration and invoke any
     * registered remove callbacks
     */
    Rule.prototype.remove = function () {
        var ruleOrder = this.domainObject.configuration.ruleOrder,
            ruleConfigById = this.domainObject.configuration.ruleConfigById,
            self = this;

        ruleConfigById[self.config.id] = undefined;
        _.remove(ruleOrder, function (ruleId) {
            return ruleId === self.config.id;
        });

        this.openmct.objects.mutate(this.domainObject, 'configuration.ruleConfigById', ruleConfigById);
        this.openmct.objects.mutate(this.domainObject, 'configuration.ruleOrder', ruleOrder);

        self.callbacks.remove.forEach(function (callback) {
            if (callback) {
                callback();
            }
        });
    };

    /**
     * Makes a deep clone of this rule's configuration, and calls the duplicate event
     * callback with the cloned configuration as an argument if one has been registered
     */
    Rule.prototype.duplicate = function () {
        var sourceRule = JSON.parse(JSON.stringify(this.config)),
            self = this;
        sourceRule.expanded = true;
        self.callbacks.duplicate.forEach(function (callback) {
            if (callback) {
                callback(sourceRule);
            }
        });
    };

    /**
     * Initialze a new condition. If called with the sourceConfig and sourceIndex arguments,
     * will insert a new condition with the provided configuration after the sourceIndex
     * index. Otherwise, initializes a new blank rule and inserts it at the end
     * of the list.
     * @param {Object} sourceConfig (optional) The configuration to use to instantiate
     *                              a new condition. Must have object, key,
     * @param {number} sourceIndex (optional) The location at which to insert the new
     *                             condition
     */
    Rule.prototype.initCondition = function (sourceConfig, sourceIndex) {
        var ruleConfigById = this.domainObject.configuration.ruleConfigById,
            newConfig,
            defaultConfig = {
                object: '',
                key: '',
                operation: '',
                values: []
            };

        newConfig = sourceConfig || defaultConfig;
        if (sourceIndex !== undefined) {
            ruleConfigById[this.config.id].conditions.splice(sourceIndex + 1, 0, newConfig);
        } else {
            ruleConfigById[this.config.id].conditions.push(newConfig);
        }
        this.domainObject.configuration.ruleConfigById = ruleConfigById;
        this.updateDomainObject();
        this.refreshConditions();
    };

    /**
     * Build {Condition} objects from configuration and rebuild associated view
     */
    Rule.prototype.refreshConditions = function () {
        var self = this;

        self.conditions = [];
        $('.t-condition', this.domElement).remove();

        this.config.conditions.forEach(function (condition, index) {
            var newCondition = new Condition(condition, index, self.conditionManager);
            newCondition.on('remove', self.removeCondition);
            newCondition.on('duplicate', self.initCondition);
            newCondition.on('change', self.onConditionChange);
            self.conditions.push(newCondition);
        });

        if (this.config.trigger === 'js') {
            this.jsConditionArea.show();
            this.addConditionButton.hide();
        } else {
            this.jsConditionArea.hide();
            this.addConditionButton.show();
            self.conditions.forEach(function (condition) {
                $('li:last-of-type', self.conditionArea).before(condition.getDOM());
            });
        }

        if (self.conditions.length === 1) {
            self.conditions[0].hideButtons();
        }

        self.generateDescription();
    };

    /**
     * Remove a condition from this rule's configuration at the given index
     * @param {number} removeIndex The index of the condition to remove
     */
    Rule.prototype.removeCondition = function (removeIndex) {
        var ruleConfigById = this.domainObject.configuration.ruleConfigById,
            conditions = ruleConfigById[this.config.id].conditions;

        _.remove(conditions, function (condition, index) {
            return index === removeIndex;
        });

        this.domainObject.configuration.ruleConfigById[this.config.id] = this.config;
        this.updateDomainObject();
        this.refreshConditions();

        this.callbacks.conditionChange.forEach(function (callback) {
            if (callback) {
                callback();
            }
        });
    };

    /**
     * Build a human-readable description from this rule's conditions
     */
    Rule.prototype.generateDescription = function () {
        var description = '',
            manager = this.conditionManager,
            evaluator = manager.getEvaluator(),
            name,
            property,
            operation,
            self = this;

        if (this.config.conditions && this.config.id !== 'default') {
            if (self.config.trigger === 'js') {
                description = 'when a custom JavaScript condition evaluates to true';
            } else {
                this.config.conditions.forEach(function (condition, index) {
                    name = manager.getObjectName(condition.object);
                    property = manager.getTelemetryPropertyName(condition.object, condition.key);
                    operation = evaluator.getOperationDescription(condition.operation, condition.values);
                    if (name || property || operation) {
                        description += 'when ' +
                            (name ? name + '\'s ' : '') +
                            (property ? property + ' ' : '') +
                            (operation ? operation + ' ' : '') +
                            (self.config.trigger === 'any' ? ' OR ' : ' AND ');
                    }
                });
            }
        }

        if (description.endsWith('OR ')) {
            description = description.substring(0, description.length - 3);
        }
        if (description.endsWith('AND ')) {
            description = description.substring(0, description.length - 4);
        }
        description = (description === '' ? this.config.description : description);
        this.description.html(description);
        this.config.description = description;
        this.updateDomainObject();
    };

    return Rule;
});
