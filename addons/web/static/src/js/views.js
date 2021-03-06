/*---------------------------------------------------------
 * OpenERP web library
 *---------------------------------------------------------*/

openerp.web.views = function(instance) {
var QWeb = instance.web.qweb,
    _t = instance.web._t;

instance.web.ActionManager = instance.web.Widget.extend({
    init: function(parent) {
        this._super(parent);
        this.inner_action = null;
        this.inner_viewmanager = null;
        this.dialog = null;
        this.dialog_viewmanager = null;
        this.client_widget = null;
    },
    dialog_stop: function () {
        if (this.dialog) {
            this.dialog_viewmanager.destroy();
            this.dialog_viewmanager = null;
            this.dialog.destroy();
            this.dialog = null;
        }
    },
    content_stop: function () {
        if (this.inner_viewmanager) {
            this.inner_viewmanager.destroy();
            this.inner_viewmanager = null;
        }
        if (this.client_widget) {
            this.client_widget.destroy();
            this.client_widget = null;
        }
    },
    do_push_state: function(state) {
        if (this.getParent() && this.getParent().do_push_state) {
            if (this.inner_action) {
                state['model'] = this.inner_action.res_model;
                if (this.inner_action.id) {
                    state['action_id'] = this.inner_action.id;
                }
            }
            this.getParent().do_push_state(state);
        }
    },
    do_load_state: function(state, warm) {
        var self = this,
            action_loaded;
        if (state.action_id) {
            var run_action = (!this.inner_viewmanager) || this.inner_viewmanager.action.id !== state.action_id;
            if (run_action) {
                this.null_action();
                action_loaded = this.do_action(state.action_id);
                instance.webclient.menu.has_been_loaded.then(function() {
                    instance.webclient.menu.open_action(state.action_id);
                });
            }
        } else if (state.model && state.id) {
            // TODO handle context & domain ?
            this.null_action();
            var action = {
                res_model: state.model,
                res_id: state.id,
                type: 'ir.actions.act_window',
                views: [[false, 'form']]
            };
            action_loaded = this.do_action(action);
        } else if (state.sa) {
            // load session action
            var self = this;
            this.null_action();
            action_loaded = this.rpc('/web/session/get_session_action',  {key: state.sa}).pipe(function(action) {
                if (action) {
                    return self.do_action(action);
                }
            });
        } else if (state.client_action) {
            this.null_action();
            this.ir_actions_client(state.client_action);
        }

        $.when(action_loaded || null).then(function() {
            if (self.inner_viewmanager) {
                self.inner_viewmanager.do_load_state(state, warm);
            }
        });
    },
    do_action: function(action, on_close) {
        if (_.isNumber(action)) {
            var self = this;
            return self.rpc("/web/action/load", { action_id: action }, function(result) {
                self.do_action(result.result, on_close);
            });
        }
        if (!action.type) {
            console.error("No type for action", action);
            return;
        }
        var type = action.type.replace(/\./g,'_');
        var popup = action.target === 'new';
        var inline = action.target === 'inline';
        action.flags = _.extend({
            views_switcher : !popup && !inline,
            search_view : !popup && !inline,
            action_buttons : !popup && !inline,
            sidebar : !popup && !inline,
            pager : !popup && !inline,
            display_title : !popup
        }, action.flags || {});
        if (!(type in this)) {
            console.error("Action manager can't handle action of type " + action.type, action);
            return;
        }
        return this[type](action, on_close);
    },
    null_action: function() {
        this.dialog_stop();
        this.content_stop();
    },
    ir_actions_act_window: function (action, on_close) {
        var self = this;
        if (_(['base.module.upgrade', 'base.setup.installer'])
                .contains(action.res_model)) {
            var old_close = on_close;
            on_close = function () {
                instance.webclient.do_reload().then(old_close);
            };
        }
        if (action.target === 'new') {
            if (this.dialog == null) {
                this.dialog = new instance.web.Dialog(this, { width: '80%' });
                if(on_close)
                    this.dialog.on_close.add(on_close);
            } else {
                this.dialog_viewmanager.destroy();
            }
            this.dialog.dialog_title = action.name;
            this.dialog_viewmanager = new instance.web.ViewManagerAction(this, action);
            this.dialog_viewmanager.appendTo(this.dialog.$element);
            this.dialog.open();
        } else  {
            this.dialog_stop();
            this.content_stop();
            if(action.menu_id) {
                return this.getParent().do_action(action, function () {
                    instance.webclient.menu.open_menu(action.menu_id);
                });
            }
            this.inner_action = action;
            this.inner_viewmanager = new instance.web.ViewManagerAction(this, action);
            this.inner_viewmanager.appendTo(this.$element);
        }
    },
    ir_actions_act_window_close: function (action, on_closed) {
        if (!this.dialog && on_closed) {
            on_closed();
        }
        this.dialog_stop();
    },
    ir_actions_server: function (action, on_closed) {
        var self = this;
        this.rpc('/web/action/run', {
            action_id: action.id,
            context: action.context || {}
        }).then(function (action) {
            self.do_action(action, on_closed)
        });
    },
    ir_actions_client: function (action) {
        this.content_stop();
        this.dialog_stop();
        var ClientWidget = instance.web.client_actions.get_object(action.tag);
        (this.client_widget = new ClientWidget(this, action.params)).appendTo(this.$element);
    },
    ir_actions_report_xml: function(action, on_closed) {
        var self = this;
        $.blockUI();
        self.rpc("/web/session/eval_domain_and_context", {
            contexts: [action.context],
            domains: []
        }).then(function(res) {
            action = _.clone(action);
            action.context = res.context;
            self.session.get_file({
                url: '/web/report',
                data: {action: JSON.stringify(action)},
                complete: $.unblockUI,
                success: function(){
                    if (!self.dialog && on_closed) {
                        on_closed();
                    }
                    self.dialog_stop();
                },
                error: instance.webclient.crashmanager.on_rpc_error
            })
        });
    },
    ir_actions_act_url: function (action) {
        window.open(action.url, action.target === 'self' ? '_self' : '_blank');
    },
    ir_ui_menu: function (action) {
        this.getParent().do_action(action);
    }
});

instance.web.ViewManager =  instance.web.Widget.extend({
    template: "ViewManager",
    init: function(parent, dataset, views, flags) {
        this._super(parent);
        this.model = dataset ? dataset.model : undefined;
        this.dataset = dataset;
        this.searchview = null;
        this.active_view = null;
        this.views_src = _.map(views, function(x) {
            if (x instanceof Array) {
                var View = instance.web.views.get_object(x[1], true);
                return {
                    view_id: x[0],
                    view_type: x[1],
                    label: View ? View.prototype.display_name : (void 'nope')
                };
            } else {
                return x;
            }
        });
        this.views = {};
        this.flags = flags || {};
        this.registry = instance.web.views;
        this.views_history = [];
    },
    /**
     * @returns {jQuery.Deferred} initial view loading promise
     */
    start: function() {
        this._super();
        var self = this;
        this.$element.find('.oe_view_manager_switch a').click(function() {
            self.on_mode_switch($(this).data('view-type'));
        }).tipsy();
        var views_ids = {};
        _.each(this.views_src, function(view) {
            self.views[view.view_type] = $.extend({}, view, {
                deferred : $.Deferred(),
                controller : null,
                options : _.extend({
                    $buttons : self.$element.find('.oe_view_manager_buttons'),
                    $sidebar : self.flags.sidebar ? self.$element.find('.oe_view_manager_sidebar') : undefined,
                    $pager : self.$element.find('.oe_view_manager_pager'),
                    action : self.action,
                    action_views_ids : views_ids
                }, self.flags, self.flags[view.view_type] || {}, view.options || {})
            });
            views_ids[view.view_type] = view.view_id;
        });
        if (this.flags.views_switcher === false) {
            this.$element.find('.oe_view_manager_switch').hide();
        }
        // If no default view defined, switch to the first one in sequence
        var default_view = this.flags.default_view || this.views_src[0].view_type;
        return this.on_mode_switch(default_view);
    },
    /**
     * Asks the view manager to switch visualization mode.
     *
     * @param {String} view_type type of view to display
     * @param {Boolean} [no_store=false] don't store the view being switched to on the switch stack
     * @returns {jQuery.Deferred} new view loading promise
     */
    on_mode_switch: function(view_type, no_store) {
        var self = this;
        var view = this.views[view_type];
        var view_promise;
        if(!view)
            return $.Deferred().reject();

        if (!no_store) {
            this.views_history.push(view_type);
        }
        this.active_view = view_type;

        if (!view.controller) {
            // Lazy loading of views
            var controllerclass = this.registry.get_object(view_type);
            var options = _.clone(view.options);
            if (view_type === "form" && this.action) {
                switch (this.action.target) {
                    case 'new':
                    case 'inline':
                        options.initial_mode = 'edit';
                        break;
                }
            }
            var controller = new controllerclass(this, this.dataset, view.view_id, options);
            if (view.embedded_view) {
                controller.set_embedded_view(view.embedded_view);
            }
            controller.do_switch_view.add_last(this.on_mode_switch);
            controller.do_prev_view.add_last(this.on_prev_view);
            var container = this.$element.find(".oe_view_manager_view_" + view_type);
            view_promise = controller.appendTo(container);
            this.views[view_type].controller = controller;
            this.views[view_type].deferred.resolve(view_type);
            $.when(view_promise).then(function() {
                self.on_controller_inited(view_type, controller);
                if (self.searchview
                        && self.flags.auto_search
                        && view.controller.searchable !== false) {
                    self.searchview.ready.then(self.searchview.do_search);
                }
            });
        } else if (this.searchview
                && self.flags.auto_search
                && view.controller.searchable !== false) {
            this.searchview.ready.then(this.searchview.do_search);
        }

        if (this.searchview) {
            this.searchview[(view.controller.searchable === false || this.searchview.hidden) ? 'hide' : 'show']();
        }

        this.$element
            .find('.oe_view_manager_switch a').parent().removeClass('active')
        this.$element
            .find('.oe_view_manager_switch a').filter('[data-view-type="' + view_type + '"]')
            .parent().addClass('active');

        $.when(view_promise).then(function () {
            _.each(_.keys(self.views), function(view_name) {
                var controller = self.views[view_name].controller;
                if (controller) {
                    if (view_name === view_type) {
                        controller.do_show();
                    } else {
                        controller.do_hide();
                    }
                }
            });

            self.$element.find('.oe_view_title_text:first').text(
                    self.display_title());
        });
        return view_promise;
    },
    /**
     * Returns to the view preceding the caller view in this manager's
     * navigation history (the navigation history is appended to via
     * on_mode_switch)
     *
     * @param {Object} [options]
     * @param {Boolean} [options.created=false] resource was created
     * @param {String} [options.default=null] view to switch to if no previous view
     * @returns {$.Deferred} switching end signal
     */
    on_prev_view: function (options) {
        options = options || {};
        var current_view = this.views_history.pop();
        var previous_view = this.views_history[this.views_history.length - 1] || options['default'];
        if (options.created && current_view === 'form' && previous_view === 'list') {
            // APR special case: "If creation mode from list (and only from a list),
            // after saving, go to page view (don't come back in list)"
            return this.on_mode_switch('form');
        } else if (options.created && !previous_view && this.action && this.action.flags.default_view === 'form') {
            // APR special case: "If creation from dashboard, we have no previous view
            return this.on_mode_switch('form');
        }
        return this.on_mode_switch(previous_view, true);
    },
    /**
     * Sets up the current viewmanager's search view.
     *
     * @param {Number|false} view_id the view to use or false for a default one
     * @returns {jQuery.Deferred} search view startup deferred
     */
    setup_search_view: function(view_id, search_defaults) {
        var self = this;
        if (this.searchview) {
            this.searchview.destroy();
        }
        this.searchview = new instance.web.SearchView(this, this.dataset, view_id, search_defaults, this.flags.search_view === false);

        this.searchview.on_search.add(this.do_searchview_search);
        return this.searchview.appendTo(this.$element.find(".oe_view_manager_view_search"));
    },
    do_searchview_search: function(domains, contexts, groupbys) {
        var self = this,
            controller = this.views[this.active_view].controller,
            action_context = this.action.context || {};
        this.rpc('/web/session/eval_domain_and_context', {
            domains: [this.action.domain || []].concat(domains || []),
            contexts: [action_context].concat(contexts || []),
            group_by_seq: groupbys || []
        }, function (results) {
            self.dataset._model = new instance.web.Model(
                self.dataset.model, results.context, results.domain);
            var groupby = results.group_by.length
                        ? results.group_by
                        : action_context.group_by;
            if (_.isString(groupby)) {
                groupby = [groupby];
            }
            controller.do_search(results.domain, results.context, groupby || []);
        });
    },
    /**
     * Event launched when a controller has been inited.
     *
     * @param {String} view_type type of view
     * @param {String} view the inited controller
     */
    on_controller_inited: function(view_type, view) {
    },
    /**
     * Called when one of the view want to execute an action
     */
    on_action: function(action) {
    },
    on_create: function() {
    },
    on_remove: function() {
    },
    on_edit: function() {
    },
    /**
     * Called by children view after executing an action
     */
    on_action_executed: function () {
    },
    display_title: function () {
        var view = this.views[this.active_view];
        if (view) {
            // ick
            return view.controller.fields_view.arch.attrs.string;
        }
        return '';
    }
});

instance.web.ViewManagerAction = instance.web.ViewManager.extend({
    template:"ViewManagerAction",
    /**
     * @constructs instance.web.ViewManagerAction
     * @extends instance.web.ViewManager
     *
     * @param {instance.web.ActionManager} parent parent object/widget
     * @param {Object} action descriptor for the action this viewmanager needs to manage its views.
     */
    init: function(parent, action) {
        // dataset initialization will take the session from ``this``, so if we
        // do not have it yet (and we don't, because we've not called our own
        // ``_super()``) rpc requests will blow up.
        var flags = action.flags || {};
        if (!('auto_search' in flags)) {
            flags.auto_search = action.auto_search !== false;
        }
        if (action.res_model == 'board.board' && action.view_mode === 'form') {
            // Special case for Dashboards
            _.extend(flags, {
                views_switcher : false,
                display_title : false,
                search_view : false,
                pager : false,
                sidebar : false,
                action_buttons : false
            });
        }
        this._super(parent, null, action.views, flags);
        this.session = parent.session;
        this.action = action;
        var dataset = new instance.web.DataSetSearch(this, action.res_model, action.context, action.domain);
        if (action.res_id) {
            dataset.ids.push(action.res_id);
            dataset.index = 0;
        }
        this.dataset = dataset;

        // setup storage for session-wise menu hiding
        if (this.session.hidden_menutips) {
            return;
        }
        this.session.hidden_menutips = {}
    },
    /**
     * Initializes the ViewManagerAction: sets up the searchview (if the
     * searchview is enabled in the manager's action flags), calls into the
     * parent to initialize the primary view and (if the VMA has a searchview)
     * launches an initial search after both views are done rendering.
     */
    start: function() {
        var self = this,
            searchview_loaded,
            search_defaults = {};
        _.each(this.action.context, function (value, key) {
            var match = /^search_default_(.*)$/.exec(key);
            if (match) {
                search_defaults[match[1]] = value;
            }
        });
        // init search view
        var searchview_id = this.action['search_view_id'] && this.action['search_view_id'][0];

        searchview_loaded = this.setup_search_view(searchview_id || false, search_defaults);

        var main_view_loaded = this._super();

        var manager_ready = $.when(searchview_loaded, main_view_loaded);

        this.$element.find('.oe_debug_view').change(this.on_debug_changed);

        if (this.action.help && !this.flags.low_profile) {
            var Users = new instance.web.DataSet(self, 'res.users'),
                $tips = this.$element.find('.oe_view_manager_menu_tips');
            $tips.delegate('blockquote button', 'click', function() {
                var $this = $(this);
                //noinspection FallthroughInSwitchStatementJS
                switch ($this.attr('name')) {
                case 'disable':
                    Users.write(self.session.uid, {menu_tips:false});
                case 'hide':
                    $this.closest('blockquote').hide();
                    self.session.hidden_menutips[self.action.id] = true;
                }
            });
            if (!(self.action.id in self.session.hidden_menutips)) {
                Users.read_ids([this.session.uid], ['menu_tips']).then(function(users) {
                    var user = users[0];
                    if (!(user && user.id === self.session.uid)) {
                        return;
                    }
                    $tips.find('blockquote').toggle(user.menu_tips);
                });
            }
        }

        return manager_ready;
    },
    on_debug_changed: function (evt) {
        var self = this,
            $sel = $(evt.currentTarget),
            $option = $sel.find('option:selected'),
            val = $sel.val(),
            current_view = this.views[this.active_view].controller;
        switch (val) {
            case 'fvg':
                var dialog = new instance.web.Dialog(this, { title: _t("Fields View Get"), width: '95%' }).open();
                $('<pre>').text(instance.web.json_node_to_xml(current_view.fields_view.arch, true)).appendTo(dialog.$element);
                break;
            case 'perm_read':
                var ids = current_view.get_selected_ids();
                if (ids.length === 1) {
                    this.dataset.call('perm_read', [ids]).then(function(result) {
                        var dialog = new instance.web.Dialog(this, {
                            title: _.str.sprintf(_t("View Log (%s)"), self.dataset.model),
                            width: 400
                        }, QWeb.render('ViewManagerDebugViewLog', {
                            perm : result[0],
                            format : instance.web.format_value
                        })).open();
                    });
                }
                break;
            case 'toggle_layout_outline':
                current_view.rendering_engine.toggle_layout_debugging();
                break;
            case 'fields':
                this.dataset.call_and_eval(
                        'fields_get', [false, {}], null, 1).then(function (fields) {
                    var $root = $('<dl>');
                    _(fields).each(function (attributes, name) {
                        $root.append($('<dt>').append($('<h4>').text(name)));
                        var $attrs = $('<dl>').appendTo(
                                $('<dd>').appendTo($root));
                        _(attributes).each(function (def, name) {
                            if (def instanceof Object) {
                                def = JSON.stringify(def);
                            }
                            $attrs
                                .append($('<dt>').text(name))
                                .append($('<dd style="white-space: pre-wrap;">').text(def));
                        });
                    });
                    new instance.web.Dialog(self, {
                        title: _.str.sprintf(_t("Model %s fields"),
                                             self.dataset.model),
                        width: '95%'}, $root).open();
                });
                break;
            case 'manage_views':
                if (current_view.fields_view && current_view.fields_view.arch) {
                    var view_editor = new instance.web.ViewEditor(current_view, current_view.$element, this.dataset, current_view.fields_view.arch);
                    view_editor.start();
                } else {
                    this.do_warn(_t("Manage Views"),
                            _t("Could not find current view declaration"));
                }
                break;
            case 'edit_workflow':
                return this.do_action({
                    res_model : 'workflow',
                    domain : [['osv', '=', this.dataset.model]],
                    views: [[false, 'list'], [false, 'form'], [false, 'diagram']],
                    type : 'ir.actions.act_window',
                    view_type : 'list',
                    view_mode : 'list'
                });
                break;
            case 'edit':
                this.do_edit_resource($option.data('model'), $option.data('id'), { name : $option.text() });
                break;
            default:
                if (val) {
                    console.log("No debug handler for ", val);
                }
        }
        evt.currentTarget.selectedIndex = 0;
    },
    do_edit_resource: function(model, id, action) {
        var action = _.extend({
            res_model : model,
            res_id : id,
            type : 'ir.actions.act_window',
            view_type : 'form',
            view_mode : 'form',
            views : [[false, 'form']],
            target : 'new',
            flags : {
                action_buttons : true,
                form : {
                    resize_textareas : true
                }
            }
        }, action || {});
        this.do_action(action);
    },
    on_mode_switch: function (view_type, no_store) {
        var self = this;

        return $.when(this._super(view_type, no_store)).then(function () {
            var controller = self.views[self.active_view].controller,
                fvg = controller.fields_view,
                view_id = (fvg && fvg.view_id) || '--';
            self.$element.find('.oe_debug_view').html(QWeb.render('ViewManagerDebug', {
                view: controller,
                view_manager: self
            }));
            if (!self.action.name && fvg) {
                self.$element.find('.oe_view_title_text').text(fvg.arch.attrs.string || fvg.name);
            }

        });
    },
    do_push_state: function(state) {
        if (this.getParent() && this.getParent().do_push_state) {
            state["view_type"] = this.active_view;
            this.getParent().do_push_state(state);
        }
    },
    do_load_state: function(state, warm) {
        var self = this,
            defs = [];
        if (state.view_type && state.view_type !== this.active_view) {
            defs.push(
                this.views[this.active_view].deferred.pipe(function() {
                    return self.on_mode_switch(state.view_type, true);
                })
            );
        } 

        $.when(defs).then(function() {
            self.views[self.active_view].controller.do_load_state(state, warm);
        });
    },
    display_title: function () {
        return this.action.name;
    }
});

instance.web.Sidebar = instance.web.Widget.extend({
    init: function(parent) {
        this._super(parent);
        var view = this.getParent();
        this.sections = [
            { 'name' : 'print', 'label' : _t('Print'), },
            { 'name' : 'files', 'label' : _t('Attachement'), },
            { 'name' : 'other', 'label' : _t('More'), }
        ];
        this.items = {
            'print' : [],
            'files' : [],
            'other' : [
                    { label: _t("Import"), callback: view.on_sidebar_import },
                    { label: _t("Export"), callback: view.on_sidebar_export }
            ]
        }
        if (this.session.uid === 1) {
            var item = { label: _t("Translate"), callback: view.on_sidebar_translate, title: _t("Technical translation") };
            this.items.other.push(item);
        }
    },
    start: function() {
        var self = this;
        this._super(this);
        this.redraw();
        this.$element.on('click','.oe_dropdown_toggle',function(event) {
            $(this).parent().find('ul').toggle();
            return false;
        });
        this.$element.on('click','.oe_dropdown_menu li a', function(event) {
            var section = $(this).data('section');
            var index = $(this).data('index');
            $(this).closest('ul').hide();
            var item = self.items[section][index];
            if (item.callback) {
                item.callback.apply(self, [item]);
            } else if (item.action) {
                self.on_item_action_clicked(item);
            } else if (item.url) {
                return true;
            }
            return false;
        });
        //this.$div.html(QWeb.render('FormView.sidebar.attachments', this));
        //this.$element.find('.oe-binary-file').change(this.on_attachment_changed);
        //this.$element.find('.oe-sidebar-attachment-delete').click(this.on_attachment_delete);
    },
    redraw: function() {
        var self = this;
        self.$element.html(QWeb.render('Sidebar', {widget: self}));
        this.$element.find('ul').hide();
    },
    /**
     * For each item added to the section:
     *
     * ``label``
     *     will be used as the item's name in the sidebar, can be html
     *
     * ``action``
     *     descriptor for the action which will be executed, ``action`` and
     *     ``callback`` should be exclusive
     *
     * ``callback``
     *     function to call when the item is clicked in the sidebar, called
     *     with the item descriptor as its first argument (so information
     *     can be stored as additional keys on the object passed to
     *     ``add_items``)
     *
     * ``classname`` (optional)
     *     ``@class`` set on the sidebar serialization of the item
     *
     * ``title`` (optional)
     *     will be set as the item's ``@title`` (tooltip)
     *
     * @param {String} section_code
     * @param {Array<{label, action | callback[, classname][, title]}>} items
     */
    add_items: function(section_code, items) {
        var self = this;
        if (items) {
            this.items[section_code].push.apply(this.items[section_code],items);
            this.redraw();
        }
    },
    add_toolbar: function(toolbar) {
        var self = this;
        _.each(['print','action','relate'], function(type) {
            var items = toolbar[type];
            if (items) {
                for (var i = 0; i < items.length; i++) {
                    items[i] = {
                        label: items[i]['name'],
                        action: items[i],
                        classname: 'oe_sidebar_' + type
                    }
                }
                self.add_items(type=='print' ? 'print' : 'other', items);
            }
        });
    },
    on_item_action_clicked: function(item) {
        var self = this;
        self.getParent().sidebar_context().then(function (context) {
            var ids = self.getParent().get_selected_ids();
            if (ids.length == 0) {
                instance.web.dialog($("<div />").text(_t("You must choose at least one record.")), { title: _t("Warning"), modal: true });
                return false;
            }
            var additional_context = _.extend({
                active_id: ids[0],
                active_ids: ids,
                active_model: self.getParent().dataset.model
            }, context);
            self.rpc("/web/action/load", {
                action_id: item.action.id,
                context: additional_context
            }, function(result) {
                result.result.context = _.extend(result.result.context || {},
                    additional_context);
                result.result.flags = result.result.flags || {};
                result.result.flags.new_window = true;
                self.do_action(result.result, function () {
                    // reload view
                    self.getParent().reload();
                });
            });
        });
    },
    do_attachement_update: function(dataset, model_id) {
        if (!model_id) {
            this.on_attachments_loaded([]);
        } else {
            var dom = [ ['res_model', '=', dataset.model], ['res_id', '=', model_id], ['type', 'in', ['binary', 'url']] ];
            var ds = new instance.web.DataSetSearch(this, 'ir.attachment', dataset.get_context(), dom);
            ds.read_slice(['name', 'url', 'type'], {}).then(this.on_attachments_loaded);
        }
    },
    on_attachments_loaded: function(attachments) {
        var self = this;
        var items = [];
        // TODO: preprend: _s +
        var prefix = '/web/binary/saveas?session_id=' + self.session.session_id + '&model=ir.attachment&field=datas&filename_field=name&id=';
        _.each(attachments,function(a) {
            a.label = a.name;
            if(a.type === "binary") {
                a.url = prefix  + a.id + '&t=' + (new Date().getTime());
            }
        });
        attachments.push( { label: _t("Add..."), callback: self.on_attachment_add } );
        self.items['files'] = attachments;
        self.redraw();
    },
    on_attachment_add: function(e) {
        this.$element.find('.oe_sidebar_add').show();
    },
    on_attachment_changed: function(e) {
        return;
        window[this.element_id + '_iframe'] = this.do_update;
        var $e = $(e.target);
        if ($e.val() != '') {
            this.$element.find('form.oe-binary-form').submit();
            $e.parent().find('input[type=file]').prop('disabled', true);
            $e.parent().find('button').prop('disabled', true).find('img, span').toggle();
        }
    },
    on_attachment_delete: function(e) {
        return;
        var self = this, $e = $(e.currentTarget);
        var name = _.str.trim($e.parent().find('a.oe-sidebar-attachments-link').text());
        if (confirm(_.str.sprintf(_t("Do you really want to delete the attachment %s?"), name))) {
            this.rpc('/web/dataset/unlink', {
                model: 'ir.attachment',
                ids: [parseInt($e.attr('data-id'))]
            }, function(r) {
                $e.parent().remove();
                self.do_notify("Delete an attachment", "The attachment '" + name + "' has been deleted");
            });
        }
    }
});

instance.web.TranslateDialog = instance.web.Dialog.extend({
    dialog_title: {toString: function () { return _t("Translations"); }},
    init: function(view) {
        // TODO fme: should add the language to fields_view_get because between the fields view get
        // and the moment the user opens the translation dialog, the user language could have been changed
        this.view_language = view.session.user_context.lang;
        this['on_button' + _t("Save")] = this.on_button_Save;
        this['on_button' + _t("Close")] = this.on_button_Close;
        this._super(view, {
            width: '80%',
            height: '80%'
        });
        this.view = view;
        this.view_type = view.fields_view.type || '';
        this.$fields_form = null;
        this.$view_form = null;
        this.$sidebar_form = null;
        this.translatable_fields_keys = _.map(this.view.translatable_fields || [], function(i) { return i.name });
        this.languages = null;
        this.languages_loaded = $.Deferred();
        (new instance.web.DataSetSearch(this, 'res.lang', this.view.dataset.get_context(),
            [['translatable', '=', '1']])).read_slice(['code', 'name'], { sort: 'id' }).then(this.on_languages_loaded);
    },
    start: function() {
        var self = this;
        this._super();
        $.when(this.languages_loaded).then(function() {
            self.$element.html(instance.web.qweb.render('TranslateDialog', { widget: self }));
            self.$fields_form = self.$element.find('.oe_translation_form');
            self.$fields_form.find('.oe_trad_field').change(function() {
                $(this).toggleClass('touched', ($(this).val() != $(this).attr('data-value')));
            });
        });
        return this;
    },
    on_languages_loaded: function(langs) {
        this.languages = langs;
        this.languages_loaded.resolve();
    },
    do_load_fields_values: function(callback) {
        var self = this,
            deffered = [];
        this.$fields_form.find('.oe_trad_field').val('').removeClass('touched');
        _.each(self.languages, function(lg) {
            var deff = $.Deferred();
            deffered.push(deff);
            var callback = function(values) {
                _.each(self.translatable_fields_keys, function(f) {
                    self.$fields_form.find('.oe_trad_field[name="' + lg.code + '-' + f + '"]').val(values[0][f] || '').attr('data-value', values[0][f] || '');
                });
                deff.resolve();
            };
            if (lg.code === self.view_language) {
                var values = {};
                _.each(self.translatable_fields_keys, function(field) {
                    values[field] = self.view.fields[field].get_value();
                });
                callback([values]);
            } else {
                self.rpc('/web/dataset/get', {
                    model: self.view.dataset.model,
                    ids: [self.view.datarecord.id],
                    fields: self.translatable_fields_keys,
                    context: self.view.dataset.get_context({
                        'lang': lg.code
                    })}, callback);
            }
        });
        $.when.apply(null, deffered).then(callback);
    },
    open: function(field) {
        var self = this,
            sup = this._super;
        $.when(this.languages_loaded).then(function() {
            if (self.view.translatable_fields && self.view.translatable_fields.length) {
                self.do_load_fields_values(function() {
                    sup.call(self);
                    if (field) {
                        var $field_input = self.$element.find('tr[data-field="' + field.name + '"] td:nth-child(2) *:first-child');
                        self.$element.scrollTo($field_input);
                        $field_input.focus();
                    }
                });
            } else {
                sup.call(self);
            }
        });
    },
    on_button_Save: function() {
        var trads = {},
            self = this,
            trads_mutex = new $.Mutex();
        self.$fields_form.find('.oe_trad_field.touched').each(function() {
            var field = $(this).attr('name').split('-');
            if (!trads[field[0]]) {
                trads[field[0]] = {};
            }
            trads[field[0]][field[1]] = $(this).val();
        });
        _.each(trads, function(data, code) {
            if (code === self.view_language) {
                _.each(data, function(value, field) {
                    self.view.fields[field].set_value(value);
                });
            }
            trads_mutex.exec(function() {
                return self.view.dataset.write(self.view.datarecord.id, data, { context : { 'lang': code } });
            });
        });
        this.close();
    },
    on_button_Close: function() {
        this.close();
    }
});

instance.web.View = instance.web.Widget.extend({
    template: "EmptyComponent",
    // name displayed in view switchers
    display_name: '',
    /**
     * Define a view type for each view to allow automatic call to fields_view_get.
     */
    view_type: undefined,
    init: function(parent, dataset, view_id, options) {
        this._super(parent);
        this.dataset = dataset;
        this.view_id = view_id;
        this.set_default_options(options);
    },
    start: function() {
        return this.load_view();
    },
    load_view: function() {
        if (this.embedded_view) {
            var def = $.Deferred();
            var self = this;
            $.async_when().then(function() {def.resolve(self.embedded_view);});
            return def.pipe(this.on_loaded);
        } else {
            var context = new instance.web.CompoundContext(this.dataset.get_context());
            if (! this.view_type)
                console.warn("view_type is not defined", this);
            return this.rpc("/web/view/load", {
                "model": this.dataset.model,
                "view_id": this.view_id,
                "view_type": this.view_type,
                toolbar: !!this.options.$sidebar,
                context: context
                }).pipe(this.on_loaded);
        }
    },
    /**
     * Called after a successful call to fields_view_get.
     * Must return a promise.
     */
    on_loaded: function(fields_view_get) {
    },
    set_default_options: function(options) {
        this.options = options || {};
        _.defaults(this.options, {
            // All possible views options should be defaulted here
            $sidebar: null,
            sidebar_id: null,
            action: null,
            action_views_ids: {}
        });
    },
    open_translate_dialog: function(field) {
        if (!this.translate_dialog) {
            this.translate_dialog = new instance.web.TranslateDialog(this).start();
        }
        this.translate_dialog.open(field);
    },
    /**
     * Fetches and executes the action identified by ``action_data``.
     *
     * @param {Object} action_data the action descriptor data
     * @param {String} action_data.name the action name, used to uniquely identify the action to find and execute it
     * @param {String} [action_data.special=null] special action handlers (currently: only ``'cancel'``)
     * @param {String} [action_data.type='workflow'] the action type, if present, one of ``'object'``, ``'action'`` or ``'workflow'``
     * @param {Object} [action_data.context=null] additional action context, to add to the current context
     * @param {instance.web.DataSet} dataset a dataset object used to communicate with the server
     * @param {Object} [record_id] the identifier of the object on which the action is to be applied
     * @param {Function} on_closed callback to execute when dialog is closed or when the action does not generate any result (no new action)
     */
    do_execute_action: function (action_data, dataset, record_id, on_closed) {
        var self = this;
        var result_handler = function () {
            if (on_closed) { on_closed.apply(null, arguments); }
            if (self.getParent() && self.getParent().on_action_executed) {
                return self.getParent().on_action_executed.apply(null, arguments);
            }
        };
        var context = new instance.web.CompoundContext(dataset.get_context(), action_data.context || {});

        var handler = function (r) {
            var action = r.result;
            if (action && action.constructor == Object) {
                var ncontext = new instance.web.CompoundContext(context);
                if (record_id) {
                    ncontext.add({
                        active_id: record_id,
                        active_ids: [record_id],
                        active_model: dataset.model
                    });
                }
                ncontext.add(action.context || {});
                return self.rpc('/web/session/eval_domain_and_context', {
                    contexts: [ncontext],
                    domains: []
                }).pipe(function (results) {
                    action.context = results.context;
                    /* niv: previously we were overriding once more with action_data.context,
                     * I assumed this was not a correct behavior and removed it
                     */
                    return self.do_action(action, result_handler);
                }, null);
            } else {
                return result_handler();
            }
        };

        if (action_data.special) {
            return handler({result: {"type":"ir.actions.act_window_close"}});
        } else if (action_data.type=="object") {
            var args = [[record_id]], additional_args = [];
            if (action_data.args) {
                try {
                    // Warning: quotes and double quotes problem due to json and xml clash
                    // Maybe we should force escaping in xml or do a better parse of the args array
                    additional_args = JSON.parse(action_data.args.replace(/'/g, '"'));
                    args = args.concat(additional_args);
                } catch(e) {
                    console.error("Could not JSON.parse arguments", action_data.args);
                }
            }
            args.push(context);
            return dataset.call_button(action_data.name, args, handler);
        } else if (action_data.type=="action") {
            return this.rpc('/web/action/load', { action_id: parseInt(action_data.name, 10), context: context, do_not_eval: true}, handler);
        } else  {
            return dataset.exec_workflow(record_id, action_data.name, handler);
        }
    },
    /**
     * Directly set a view to use instead of calling fields_view_get. This method must
     * be called before start(). When an embedded view is set, underlying implementations
     * of instance.web.View must use the provided view instead of any other one.
     *
     * @param embedded_view A view.
     */
    set_embedded_view: function(embedded_view) {
        this.embedded_view = embedded_view;
    },
    do_show: function () {
        this.$element.show();
    },
    do_hide: function () {
        this.$element.hide();
    },
    do_push_state: function(state) {
        if (this.getParent() && this.getParent().do_push_state) {
            this.getParent().do_push_state(state);
        }
    },
    do_load_state: function(state, warm) {
    },
    /**
     * Switches to a specific view type
     *
     * @param {String} view view type to switch to
     */
    do_switch_view: function(view) { 
    },
    /**
     * Cancels the switch to the current view, switches to the previous one
     *
     * @param {Object} [options]
     * @param {Boolean} [options.created=false] resource was created
     * @param {String} [options.default=null] view to switch to if no previous view
     */
    do_prev_view: function (options) {
    },
    do_search: function(view) {
    },
    on_sidebar_import: function() {
        var import_view = new instance.web.DataImport(this, this.dataset);
        import_view.start();
    },
    on_sidebar_export: function() {
        var export_view = new instance.web.DataExport(this, this.dataset);
        export_view.start();
    },
    on_sidebar_translate: function() {
        return this.do_action({
            res_model : 'ir.translation',
            domain : [['type', '!=', 'object'], '|', ['name', '=', this.dataset.model], ['name', 'ilike', this.dataset.model + ',']],
            views: [[false, 'list'], [false, 'form']],
            type : 'ir.actions.act_window',
            view_type : "list",
            view_mode : "list"
        });
    },
    sidebar_context: function () {
        return $.when();
    },
    /**
     * Asks the view to reload itself, if the reloading is asynchronous should
     * return a {$.Deferred} indicating when the reloading is done.
     */
    reload: function () {
        return $.when();
    }
});

instance.web.xml_to_json = function(node) {
    switch (node.nodeType) {
        case 3:
        case 4:
            return node.data;
        break;
        case 1:
            var attrs = $(node).getAttributes();
            _.each(['domain', 'filter_domain', 'context', 'default_get'], function(key) {
                if (attrs[key]) {
                    try {
                        attrs[key] = JSON.parse(attrs[key]);
                    } catch(e) { }
                }
            });
            return {
                tag: node.tagName.toLowerCase(),
                attrs: attrs,
                children: _.map(node.childNodes, instance.web.xml_to_json)
            }
    }
}
instance.web.json_node_to_xml = function(node, human_readable, indent) {
    // For debugging purpose, this function will convert a json node back to xml
    // Maybe useful for xml view editor
    indent = indent || 0;
    var sindent = (human_readable ? (new Array(indent + 1).join('\t')) : ''),
        r = sindent + '<' + node.tag,
        cr = human_readable ? '\n' : '';

    if (typeof(node) === 'string') {
        return sindent + node;
    } else if (typeof(node.tag) !== 'string' || !node.children instanceof Array || !node.attrs instanceof Object) {
        throw("Node a json node");
    }
    for (var attr in node.attrs) {
        var vattr = node.attrs[attr];
        if (typeof(vattr) !== 'string') {
            // domains, ...
            vattr = JSON.stringify(vattr);
        }
        vattr = vattr.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        if (human_readable) {
            vattr = vattr.replace(/&quot;/g, "'");
        }
        r += ' ' + attr + '="' + vattr + '"';
    }
    if (node.children && node.children.length) {
        r += '>' + cr;
        var childs = [];
        for (var i = 0, ii = node.children.length; i < ii; i++) {
            childs.push(instance.web.json_node_to_xml(node.children[i], human_readable, indent + 1));
        }
        r += childs.join(cr);
        r += cr + sindent + '</' + node.tag + '>';
        return r;
    } else {
        return r + '/>';
    }
}
instance.web.xml_to_str = function(node) {
    if (window.ActiveXObject) {
        return node.xml;
    } else {
        return (new XMLSerializer()).serializeToString(node);
    }
}
instance.web.str_to_xml = function(s) {
    if (window.DOMParser) {
        var dp = new DOMParser();
        var r = dp.parseFromString(s, "text/xml");
        if (r.body && r.body.firstChild && r.body.firstChild.nodeName == 'parsererror') {
            throw new Error("Could not parse string to xml");
        }
        return r;
    }
    var xDoc;
    try {
        xDoc = new ActiveXObject("MSXML2.DOMDocument");
    } catch (e) {
        throw new Error("Could not find a DOM Parser: " + e.message);
    }
    xDoc.async = false;
    xDoc.preserveWhiteSpace = true;
    xDoc.loadXML(s);
    return xDoc;
}

/**
 * Registry for all the main views
 */
instance.web.views = new instance.web.Registry();

};

// vim:et fdc=0 fdl=0 foldnestmax=3 fdm=syntax:
