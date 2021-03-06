/*---------------------------------------------------------
 * OpenERP Web chrome
 *---------------------------------------------------------*/
openerp.web.chrome = function(instance) {
var QWeb = instance.web.qweb,
    _t = instance.web._t;

instance.web.Notification =  instance.web.Widget.extend({
    template: 'Notification',
    init: function() {
        this._super.apply(this, arguments);
        // move to instance.web.notification
        instance.notification = this;
    },
    start: function() {
        this._super.apply(this, arguments);
        this.$element.notify({
            speed: 500,
            expires: 2500
        });
    },
    notify: function(title, text, sticky) {
        sticky = !!sticky;
        var opts = {};
        if (sticky) {
            opts.expires = false;
        }
        this.$element.notify('create', {
            title: title,
            text: text
        }, opts);
    },
    warn: function(title, text, sticky) {
        sticky = !!sticky;
        var opts = {};
        if (sticky) {
            opts.expires = false;
        }
        this.$element.notify('create', 'oe_notification_alert', {
            title: title,
            text: text
        }, opts);
    }
});

instance.web.dialog = function(element) {
    var result = element.dialog.apply(element, _.rest(_.toArray(arguments)));
    result.dialog("widget").addClass("openerp");
    return result;
};

instance.web.Dialog = instance.web.Widget.extend({
    dialog_title: "",
    init: function (parent, options, content) {
        var self = this;
        this._super(parent);
        if (content) {
            this.$element = content instanceof $ ? content : $(content);
        }
        this.dialog_options = {
            modal: true,
            destroy_on_close: true,
            width: $(window).width() * (($(window).width() > 1024) ? 0.5 : 0.75),
            min_width: 0,
            max_width: '95%',
            height: 'auto',
            min_height: 0,
            max_height: this.get_height('100%') - 140,
            autoOpen: false,
            position: [false, 50],
            buttons: {},
            beforeClose: function () { self.on_close(); },
            resizeStop: this.on_resized
        };
        for (var f in this) {
            if (f.substr(0, 10) == 'on_button_') {
                this.dialog_options.buttons[f.substr(10)] = this[f];
            }
        }
        if (options) {
            _.extend(this.dialog_options, options);
        }
        if (this.dialog_options.autoOpen) {
            this.open();
        } else {
            instance.web.dialog(this.$element, this.get_options());
        }
    },
    get_options: function(options) {
        var self = this,
            o = _.extend({}, this.dialog_options, options || {});
        _.each(['width', 'height'], function(unit) {
            o[unit] = self['get_' + unit](o[unit]);
            o['min_' + unit] = self['get_' + unit](o['min_' + unit] || 0);
            o['max_' + unit] = self['get_' + unit](o['max_' + unit] || 0);
            if (o[unit] !== 'auto' && o['min_' + unit] && o[unit] < o['min_' + unit]) o[unit] = o['min_' + unit];
            if (o[unit] !== 'auto' && o['max_' + unit] && o[unit] > o['max_' + unit]) o[unit] = o['max_' + unit];
        });
        if (!o.title && this.dialog_title) {
            o.title = this.dialog_title;
        }
        return o;
    },
    get_width: function(val) {
        return this.get_size(val.toString(), $(window.top).width());
    },
    get_height: function(val) {
        return this.get_size(val.toString(), $(window.top).height());
    },
    get_size: function(val, available_size) {
        if (val === 'auto') {
            return val;
        } else if (val.slice(-1) == "%") {
            return Math.round(available_size / 100 * parseInt(val.slice(0, -1), 10));
        } else {
            return parseInt(val, 10);
        }
    },
    open: function(options) {
        // TODO fme: bind window on resize
        if (this.template) {
            this.$element.html(this.renderElement());
        }
        var o = this.get_options(options);
        instance.web.dialog(this.$element, o).dialog('open');
        if (o.height === 'auto' && o.max_height) {
            this.$element.css({ 'max-height': o.max_height, 'overflow-y': 'auto' });
        }
        return this;
    },
    close: function() {
        this.$element.dialog('close');
    },
    on_close: function() {
        if (this.dialog_options.destroy_on_close) {
            this.$element.dialog('destroy');
        }
    },
    on_resized: function() {
        //openerp.log("Dialog resized to %d x %d", this.$element.width(), this.$element.height());
    },
    destroy: function () {
        this.close();
        this.$element.dialog('destroy');
        this._super();
    }
});

instance.web.CrashManager = instance.web.CallbackEnabled.extend({
    on_rpc_error: function(error) {
        if (error.data.fault_code) {
            var split = ("" + error.data.fault_code).split('\n')[0].split(' -- ');
            if (split.length > 1) {
                error.type = split.shift();
                error.data.fault_code = error.data.fault_code.substr(error.type.length + 4);
            }
        }
        if (error.code === 200 && error.type) {
            this.on_managed_error(error);
        } else {
            this.on_traceback(error);
        }
    },
    on_managed_error: function(error) {
        instance.web.dialog($('<div>' + QWeb.render('CrashManager.warning', {error: error}) + '</div>'), {
            title: "OpenERP " + _.str.capitalize(error.type),
            buttons: [
                {text: _t("Ok"), click: function() { $(this).dialog("close"); }}
            ]
        });
    },
    on_traceback: function(error) {
        var self = this;
        var buttons = {};
        if (instance.connection.openerp_entreprise) {
            buttons[_t("Send OpenERP Enterprise Report")] = function() {
                var $this = $(this);
                var issuename = $('#issuename').val();
                var explanation = $('#explanation').val();
                var remark = $('#remark').val();
                // Call the send method from server to send mail with details
                new instance.web.DataSet(self, 'publisher_warranty.contract').call_and_eval('send', [error.data,explanation,remark,issuename]).then(function(result){
                    if (result === false) {
                        alert('There was a communication error.');
                    } else {
                        $this.dialog('close');
                    }
                });
            };
            buttons[_t("Dont send")] = function() {
                $(this).dialog("close");
            };
        } else {
            buttons[_t("Ok")] = function() {
                $(this).dialog("close");
            };
        }
        var dialog = new instance.web.Dialog(this, {
            title: "OpenERP " + _.str.capitalize(error.type),
            width: '80%',
            height: '50%',
            min_width: '800px',
            min_height: '600px',
            buttons: buttons
        }).open();
        dialog.$element.html(QWeb.render('CrashManager.error', {session: instance.connection, error: error}));
    }
});

instance.web.Loading = instance.web.Widget.extend({
    template: 'Loading',
    init: function(parent) {
        this._super(parent);
        this.count = 0;
        this.blocked_ui = false;
        var self = this;
        this.request_call = function() {
            self.on_rpc_event(1);
        };
        this.response_call = function() {
            self.on_rpc_event(-1);
        };
        this.session.on_rpc_request.add_first(this.request_call);
        this.session.on_rpc_response.add_last(this.response_call);
    },
    destroy: function() {
        this.session.on_rpc_request.remove(this.request_call);
        this.session.on_rpc_response.remove(this.response_call);
        this.on_rpc_event(-this.count);
        this._super();
    },
    on_rpc_event : function(increment) {
        var self = this;
        if (!this.count && increment === 1) {
            // Block UI after 3s
            this.long_running_timer = setTimeout(function () {
                self.blocked_ui = true;
                $.blockUI();
            }, 3000);
        }

        this.count += increment;
        if (this.count > 0) {
            this.$element.text(_.str.sprintf( _t("Loading (%d)"), this.count));
            this.$element.show();
            this.getParent().$element.addClass('oe_wait');
        } else {
            this.count = 0;
            clearTimeout(this.long_running_timer);
            // Don't unblock if blocked by somebody else
            if (self.blocked_ui) {
                this.blocked_ui = false;
                $.unblockUI();
            }
            this.$element.fadeOut();
            this.getParent().$element.removeClass('oe_wait');
        }
    }
});

instance.web.DatabaseManager = instance.web.Widget.extend({
    init: function(parent) {
        this._super(parent);
        this.unblockUIFunction = $.unblockUI;
        $.validator.addMethod('matches', function (s, _, re) {
            return new RegExp(re).test(s);
        }, _t("Invalid database name"));
    },
    start: function() {
        var self = this;
        var fetch_db = this.rpc("/web/database/get_list", {}).pipe(
            function(result) {
                self.db_list = result.db_list;
            },
            function (_, ev) {
                ev.preventDefault();
                self.db_list = null;
            });
        var fetch_langs = this.rpc("/web/session/get_lang_list", {}).then(function(result) {
            self.lang_list = result.lang_list;
        });
        return $.when(fetch_db, fetch_langs).then(self.do_render);
    },
    do_render: function() {
        var self = this;
        self.$element.html(QWeb.render("DatabaseManager", { widget : self }));
        self.$element.find(".oe_database_manager_menu").tabs({
            show: function(event, ui) {
                $('*[autofocus]:first', ui.panel).focus();
            }
        });
        self.$element.find("form[name=create_db_form]").validate({ submitHandler: self.do_create });
        self.$element.find("form[name=drop_db_form]").validate({ submitHandler: self.do_drop });
        self.$element.find("form[name=backup_db_form]").validate({ submitHandler: self.do_backup });
        self.$element.find("form[name=restore_db_form]").validate({ submitHandler: self.do_restore });
        self.$element.find("form[name=change_pwd_form]").validate({
            messages: {
                old_pwd: "Please enter your previous password",
                new_pwd: "Please enter your new password",
                confirm_pwd: {
                    required: "Please confirm your new password",
                    equalTo: "The confirmation does not match the password"
                }
            },
            submitHandler: self.do_change_password
        });
        self.$element.find("#back_to_login").click(self.do_exit);
    },
    destroy: function () {
        this.$element.find('#db-create, #db-drop, #db-backup, #db-restore, #db-change-password, #back-to-login').unbind('click').end().empty();
        this._super();
    },
    /**
     * Converts a .serializeArray() result into a dict. Does not bother folding
     * multiple identical keys into an array, last key wins.
     *
     * @param {Array} array
     */
    to_object: function (array) {
        var result = {};
        _(array).each(function (record) {
            result[record.name] = record.value;
        });
        return result;
    },
    /**
     * Blocks UI and replaces $.unblockUI by a noop to prevent third parties
     * from unblocking the UI
     */
    blockUI: function () {
        $.blockUI();
        $.unblockUI = function () {};
    },
    /**
     * Reinstates $.unblockUI so third parties can play with blockUI, and
     * unblocks the UI
     */
    unblockUI: function () {
        $.unblockUI = this.unblockUIFunction;
        $.unblockUI();
    },
    /**
     * Displays an error dialog resulting from the various RPC communications
     * failing over themselves
     *
     * @param {Object} error error description
     * @param {String} error.title title of the error dialog
     * @param {String} error.error message of the error dialog
     */
    display_error: function (error) {
        return instance.web.dialog($('<div>'), {
            modal: true,
            title: error.title,
            buttons: [
                {text: _t("Ok"), click: function() { $(this).dialog("close"); }}
            ]
        }).html(error.error);
    },
    do_create: function(form) {
        var self = this;
        var fields = $(form).serializeArray();
        self.rpc("/web/database/create", {'fields': fields}, function(result) {
            var form_obj = self.to_object(fields);
            self.getParent().do_login( form_obj['db_name'], 'admin', form_obj['create_admin_pwd']);
            self.destroy();
        });

    },
    do_drop: function(form) {
        var self = this;
        var $form = $(form),
            fields = $form.serializeArray(),
            $db_list = $form.find('[name=drop_db]'),
            db = $db_list.val();
        if (!db || !confirm("Do you really want to delete the database: " + db + " ?")) {
            return;
        }
        self.rpc("/web/database/drop", {'fields': fields}, function(result) {
            if (result.error) {
                self.display_error(result);
                return;
            }
            self.do_notify("Dropping database", "The database '" + db + "' has been dropped");
            self.start();
        });
    },
    do_backup: function(form) {
        var self = this;
        self.blockUI();
        self.session.get_file({
            form: form,
            success: function () {
                self.do_notify(_t("Backed"), _t("Database backed up successfully"));
            },
            error: instance.webclient.crashmanager.on_rpc_error,
            complete: function() {
                self.unblockUI();
            }
        });
    },
    do_restore: function(form) {
        var self = this;
        self.blockUI();
        $(form).ajaxSubmit({
            url: '/web/database/restore',
            type: 'POST',
            resetForm: true,
            success: function (body) {
                // If empty body, everything went fine
                if (!body) { return; }

                if (body.indexOf('403 Forbidden') !== -1) {
                    self.display_error({
                        title: 'Access Denied',
                        error: 'Incorrect super-administrator password'
                    });
                } else {
                    self.display_error({
                        title: 'Restore Database',
                        error: 'Could not restore the database'
                    });
                }
            },
            complete: function() {
                self.unblockUI();
                self.do_notify(_t("Restored"), _t("Database restored successfully"));
            }
        });
    },
    do_change_password: function(form) {
        var self = this;
        self.rpc("/web/database/change_password", {
            'fields': $(form).serializeArray()
        }, function(result) {
            if (result.error) {
                self.display_error(result);
                return;
            }
            self.do_notify("Changed Password", "Password has been changed successfully");
        });
    },
    do_exit: function () {
    }
});

instance.web.Login =  instance.web.Widget.extend({
    template: "Login",
    remember_credentials: true,
    init: function(parent) {
        this._super(parent);
        this.has_local_storage = typeof(localStorage) != 'undefined';
        this.selected_db = null;
        this.selected_login = null;

        if (this.has_local_storage && this.remember_credentials) {
            this.selected_db = localStorage.getItem('last_db_login_success');
            this.selected_login = localStorage.getItem('last_login_login_success');
            if (jQuery.deparam(jQuery.param.querystring()).debug !== undefined) {
                this.selected_password = localStorage.getItem('last_password_login_success');
            }
        }
    },
    start: function() {
        var self = this;

        self.$element.find("form").submit(self.on_submit);

        self.$element.find('.oe_login_manage_db').click(function() {
            self.$element.find('.oe_login_bottom').hide();
            self.$element.find('.oe_login_pane').hide();
            self.databasemanager = new instance.web.DatabaseManager(self);
            self.databasemanager.appendTo(self.$element);
            self.databasemanager.do_exit.add_last(function() {
                self.databasemanager.destroy();
                self.$element.find('.oe_login_bottom').show();
                self.$element.find('.oe_login_pane').show();
                self.load_db_list();
            });
        });
        self.load_db_list();
    },
    load_db_list: function () {
        var self = this;
        self.rpc("/web/database/get_list", {}, function(result) {
            self.set_db_list(result.db_list);
        }, function(error, event) {
            if (error.data.fault_code === 'AccessDenied') {
                event.preventDefault();
            }
        });
    },
    set_db_list: function (list) {
        this.$element.find("[name=db]").replaceWith(instance.web.qweb.render('Login.dblist', { db_list: list, selected_db: this.selected_db}));
    },
    on_submit: function(ev) {
        if(ev) {
            ev.preventDefault();
        }
        var $e = this.$element;
        var db = $e.find("form [name=db]").val();
        if (!db) {
            this.do_warn("Login", "No database selected !");
            return false;
        }
        var login = $e.find("form input[name=login]").val();
        var password = $e.find("form input[name=password]").val();

        this.do_login(db, login, password);
    },
    /**
     * Performs actual login operation, and UI-related stuff
     *
     * @param {String} db database to log in
     * @param {String} login user login
     * @param {String} password user password
     */
    do_login: function (db, login, password) {
        var self = this;
        this.$element.removeClass('oe_login_invalid');
        this.session.on_session_invalid.add({
            callback: function () {
                self.$element.addClass("oe_login_invalid");
            },
            unique: true
        });
        this.session.session_authenticate(db, login, password).then(function() {
            self.$element.removeClass("oe_login_invalid");
            if (self.has_local_storage) {
                if(self.remember_credentials) {
                    localStorage.setItem('last_db_login_success', db);
                    localStorage.setItem('last_login_login_success', login);
                    if (jQuery.deparam(jQuery.param.querystring()).debug !== undefined) {
                        localStorage.setItem('last_password_login_success', password);
                    }
                } else {
                    localStorage.setItem('last_db_login_success', '');
                    localStorage.setItem('last_login_login_success', '');
                    localStorage.setItem('last_password_login_success', '');
                }
            }
        });
    }
});

instance.web.Menu =  instance.web.Widget.extend({
    template: 'Menu',
    init: function() {
        this._super.apply(this, arguments);
        this.has_been_loaded = $.Deferred();
        this.maximum_visible_links = 'auto'; // # of menu to show. 0 = do not crop, 'auto' = algo
        this.data = {data:{children:[]}};
    },
    start: function() {
        this._super.apply(this, arguments);
        this.$secondary_menus = this.getParent().$element.find('.oe_secondary_menus_container');
        return this.do_reload();
    },
    do_reload: function() {
        return this.rpc("/web/menu/load", {}).then(this.on_loaded);
    },
    on_loaded: function(data) {
        var self = this;
        this.data = data;
        this.renderElement();
        this.limit_entries();
        this.$secondary_menus.html(QWeb.render("Menu.secondary", { widget : this }));
        this.$element.on('click', 'a.oe_menu_more_link', function() {
            self.$element.find('.oe_menu_more').toggle();
            return false;
        });
        this.$element.on('click', 'a[data-menu]', this.on_menu_click);
        this.$secondary_menus.on('click', 'a[data-menu]', this.on_menu_click);
        // Hide second level submenus
        this.$secondary_menus.find('.oe_menu_toggler').siblings('.oe_secondary_submenu').hide();
        if (self.current_menu) {
            self.open_menu(self.current_menu);
        }
        this.has_been_loaded.resolve();
    },
    limit_entries: function() {
        var maximum_visible_links = this.maximum_visible_links;
        if (maximum_visible_links === 'auto') {
            maximum_visible_links = this.auto_limit_entries();
        }
        if (maximum_visible_links < this.data.data.children.length) {
            var $more = $(QWeb.render('Menu.more')),
                $index = this.$element.find('li').eq(maximum_visible_links - 1);
            $index.after($more);
            $more.find('.oe_menu_more').append($index.next().nextAll());
        }
        this.do_hide_more();
    },
    auto_limit_entries: function() {
        // TODO: auto detect overflow and bind window on resize
        var width = $(window).width();
        return Math.floor(width / 125);
    },
    do_hide_more: function() {
        this.$element.find('.oe_menu_more').hide();
    },
    /**
     * Opens a given menu by id, as if a user had browsed to that menu by hand
     * except does not trigger any event on the way
     *
     * @param {Number} id database id of the terminal menu to select
     */
    open_menu: function (id) {
        var $clicked_menu, $sub_menu, $main_menu;
        $clicked_menu = this.$element.add(this.$secondary_menus).find('a[data-menu=' + id + ']');
        this.trigger('open_menu', id, $clicked_menu);

        if (this.$secondary_menus.has($clicked_menu).length) {
            $sub_menu = $clicked_menu.parents('.oe_secondary_menu');
            $main_menu = this.$element.find('a[data-menu=' + $sub_menu.data('menu-parent') + ']');
        } else {
            $sub_menu = this.$secondary_menus.find('.oe_secondary_menu[data-menu-parent=' + $clicked_menu.attr('data-menu') + ']');
            $main_menu = $clicked_menu;
        }

        // Activate current main menu
        this.$element.find('.oe_active').removeClass('oe_active');
        $main_menu.addClass('oe_active');

        // Show current sub menu
        this.$secondary_menus.find('.oe_secondary_menu').hide();
        $sub_menu.show();

        // Hide/Show the leftbar menu depending of the presence of sub-items
        this.$secondary_menus.parent('.oe_leftbar').toggle(!!$sub_menu.children().length);

        // Activate current menu item and show parents
        this.$secondary_menus.find('.oe_active').removeClass('oe_active');
        if ($main_menu !== $clicked_menu) {
            $clicked_menu.parents().show();
            if ($clicked_menu.is('.oe_menu_toggler')) {
                $clicked_menu.toggleClass('oe_menu_opened').siblings('.oe_secondary_submenu:first').toggle();
            } else {
                $clicked_menu.parent().addClass('oe_active');
            }
        }
    },
    /**
     * Call open_menu with the first menu_item matching an action_id
     *
     * @param {Number} id the action_id to match
     */
    open_action: function (id) {
        var $menu = this.$element.add(this.$secondary_menus).find('a[data-action-id=' + id + ']');
        var menu_id = $menu.data('menu');
        if (menu_id) {
            this.open_menu(menu_id);
        }
    },
    /**
     * Process a click on a menu item
     *
     * @param {Number} id the menu_id
     */
    menu_click: function(id) {
        if (id) {
            this.do_hide_more();
            // find back the menuitem in dom to get the action
            var $item = this.$element.find('a[data-menu=' + id + ']');
            if (!$item.length) {
                $item = this.$secondary_menus.find('a[data-menu=' + id + ']');
            }
            var action_id = $item.data('action-id');
            // If first level menu doesnt have action trigger first leaf
            if (!action_id) {
                if(this.$element.has($item).length) {
                    $sub_menu = this.$secondary_menus.find('.oe_secondary_menu[data-menu-parent=' + id + ']');
                    $items = $sub_menu.find('a[data-action-id]').filter('[data-action-id!=""]');
                    if($items.length) {
                        action_id = $items.data('action-id');
                        id = $items.data('menu');
                    }
                }
            }
            this.open_menu(id);
            this.current_menu = id;
            this.session.active_id = id;
            if (action_id) {
                this.trigger('menu_click', action_id, id, $item);
            }
        }
    },
    /**
     * Jquery event handler for menu click
     *
     * @param {Event} ev the jquery event
     */
    on_menu_click: function(ev) {
        this.menu_click($(ev.currentTarget).data('menu'));
        ev.stopPropagation();
        return false;
    },
});

instance.web.UserMenu =  instance.web.Widget.extend({
    template: "UserMenu",
    init: function(parent) {
        this._super(parent);
        this.update_promise = $.Deferred().resolve();
    },
    start: function() {
        var self = this;
        this._super.apply(this, arguments);
        $('html').bind('click', function() {
            self.$element.find('.oe_dropdown_options').hide();
        });
        this.$element.find('.oe_dropdown_toggle').click(function() {
            self.$element.find('.oe_dropdown_options').toggle();
            return false;
        });
        this.$element.on('click', '.oe_dropdown_options li a[data-menu]', function() {
            var f = self['on_menu_' + $(this).data('menu')];
            if (f) {
                f($(this));
            }
            self.$element.find('.oe_dropdown_options').hide();
            return false;
        });
    },
    change_password :function() {
        var self = this;
        this.dialog = new instance.web.Dialog(this, {
            title: _t("Change Password"),
            width : 'auto'
        }).open();
        this.dialog.$element.html(QWeb.render("UserMenu.password", self));
        this.dialog.$element.find("form[name=change_password_form]").validate({
            submitHandler: function (form) {
                self.rpc("/web/session/change_password",{
                    'fields': $(form).serializeArray()
                }, function(result) {
                    if (result.error) {
                        self.display_error(result);
                        return;
                    } else {
                        instance.webclient.on_logout();
                    }
                });
            }
        });
    },
    display_error: function (error) {
        return instance.web.dialog($('<div>'), {
            modal: true,
            title: error.title,
            buttons: [
                {text: _("Ok"), click: function() { $(this).dialog("close"); }}
            ]
        }).html(error.error);
    },
    do_update: function () {
        var self = this;
        var fct = function() {
            var $avatar = self.$element.find('.oe_topbar_avatar');
            $avatar.attr('src', $avatar.data('default-src'));
            if (!self.session.uid)
                return;
            var func = new instance.web.Model("res.users").get_func("read");
            return func(self.session.uid, ["name", "company_id"]).pipe(function(res) {
                var topbar_name = res.name;
                if(instance.connection.debug)
                    topbar_name = _.str.sprintf("%s (%s)", topbar_name, instance.connection.db);
                if(res.company_id[0] > 1)
                    topbar_name = _.str.sprintf("%s (%s)", topbar_name, res.company_id[1]);
                self.$element.find('.oe_topbar_name').text(topbar_name);
                var avatar_src = _.str.sprintf('%s/web/binary/image?session_id=%s&model=res.users&field=avatar&id=%s', self.session.prefix, self.session.session_id, self.session.uid);
                $avatar.attr('src', avatar_src);
            });
        };
        this.update_promise = this.update_promise.pipe(fct, fct);
    },
    on_action: function() {
    },
    on_menu_logout: function() {
    },
    on_menu_settings: function() {
        var self = this;
        var action_manager = new instance.web.ActionManager(this);
        var dataset = new instance.web.DataSet (this,'res.users',this.context);
        dataset.call ('action_get','',function (result){
            self.rpc('/web/action/load', {action_id:result}, function(result){
                action_manager.do_action(_.extend(result['result'], {
                    target: 'inline',
                    res_id: self.session.uid,
                    res_model: 'res.users',
                    flags: {
                        action_buttons: false,
                        search_view: false,
                        sidebar: false,
                        views_switcher: false,
                        pager: false
                    }
                }));
            });
        });
        this.dialog = new instance.web.Dialog(this,{
            title: _t("Preferences"),
            width: '700px',
            buttons: [
                {text: _t("Change password"), click: function(){ self.change_password(); }},
                {text: _t("Cancel"), click: function(){ $(this).dialog('destroy'); }},
                {text: _t("Save"), click: function(){
                        var inner_viewmanager = action_manager.inner_viewmanager;
                        inner_viewmanager.views[inner_viewmanager.active_view].controller.do_save()
                        .then(function() {
                            self.dialog.destroy();
                            // needs to refresh interface in case language changed
                            window.location.reload();
                        });
                    }
                }
            ]
        }).open();
       action_manager.appendTo(this.dialog.$element);
       action_manager.renderElement(this.dialog);
    },
    on_menu_about: function() {
        var self = this;
        self.rpc("/web/webclient/version_info", {}).then(function(res) {
            var $help = $(QWeb.render("UserMenu.about", {version_info: res}));
            $help.find('a.oe_activate_debug_mode').click(function (e) {
                e.preventDefault();
                window.location = $.param.querystring(
                        window.location.href, 'debug');
            });
            instance.web.dialog($help, {autoOpen: true,
                modal: true, width: 960, title: _t("About")});
        });
    },
});

instance.web.WebClient = instance.web.Widget.extend({
    init: function(parent) {
        var self = this;
        this._super(parent);
        instance.webclient = this;
        this.querystring = '?' + jQuery.param.querystring();
        this._current_state = null;
    },
    start: function() {
        var self = this;
        this.$element.addClass("openerp openerp-web-client-container");
        if (jQuery.param !== undefined && jQuery.deparam(jQuery.param.querystring()).kitten !== undefined) {
            this.$element.addClass("kitten-mode-activated");
            this.$element.delegate('img.oe-record-edit-link-img', 'hover', function(e) {
                self.$element.toggleClass('clark-gable');
            });
        }
        this.session.session_bind().then(function() {
            if (!self.session.session_is_valid()) {
                self.show_login();
            }
        });
        this.session.on_session_valid.add(function() {
            self.show_application();

            if(self.action_manager)
                self.action_manager.destroy();
            self.action_manager = new instance.web.ActionManager(self);
            self.action_manager.appendTo(self.$element.find('.oe_application'));
            self.bind_hashchange();
            var version_label = _t("OpenERP - Unsupported/Community Version");
            if (!self.session.openerp_entreprise) {
                self.$element.find('.oe_footer_powered').append(_.str.sprintf('<span> - <a href="http://www.openerp.com/support-or-publisher-warranty-contract" target="_blank">%s</a></span>', version_label));
                document.title = version_label;
            }
        });
        this.$element.on('mouseenter', '.oe_systray > div:not([data-tipsy=true])', function() {
            $(this).attr('data-tipsy', 'true').tipsy().trigger('mouseenter');
        });
    },
    show_login: function() {
        var self = this;
        this.destroy_content();
        this.show_common();
        self.login = new instance.web.Login(self);
        self.login.appendTo(self.$element);
    },
    show_application: function() {
        var self = this;
        this.destroy_content();
        this.show_common();
        self.$table = $(QWeb.render("WebClient", {}));
        self.$element.append(self.$table);
        self.menu = new instance.web.Menu(self);
        self.menu.replace(this.$element.find('.oe_menu_placeholder'));
        self.menu.on('menu_click', this, this.on_menu_action);
        self.user_menu = new instance.web.UserMenu(self);
        self.user_menu.replace(this.$element.find('.oe_user_menu_placeholder'));
        self.user_menu.on_menu_logout.add(this.proxy('on_logout'));
        self.user_menu.on_action.add(this.proxy('on_menu_action'));
        self.user_menu.do_update();
    },
    show_common: function() {
        var self = this;
        if (!this.crashmanager) {
            this.crashmanager =  new instance.web.CrashManager();
            instance.connection.on_rpc_error.add(this.crashmanager.on_rpc_error);
            window.onerror = function (message, file, line) {
                self.crashmanager.on_traceback({
                    type: _t("Client Error"),
                    message: message,
                    data: {debug: file + ':' + line}
                });
            };
        }
        this.notification = new instance.web.Notification(this);
        this.notification.appendTo(this.$element);
        this.loading = new instance.web.Loading(this);
        this.loading.appendTo(this.$element);
    },
    destroy_content: function() {
        _.each(_.clone(this.getChildren()), function(el) {
            el.destroy();
        });
        this.$element.children().remove();
    },
    do_reload: function() {
        var self = this;
        return this.session.session_reload().pipe(function () {
            instance.connection.load_modules(true).pipe(
                self.menu.proxy('do_reload')); });

    },
    do_notify: function() {
        var n = this.notification;
        n.notify.apply(n, arguments);
    },
    do_warn: function() {
        var n = this.notification;
        n.warn.apply(n, arguments);
    },
    on_logout: function() {
        var self = this;
        this.session.session_logout().then(function () {
            $(window).unbind('hashchange', self.on_hashchange);
            self.do_push_state({});
            //would be cool to be able to do this, but I think it will make addons do strange things
            //this.show_login();
            window.location.reload();
        });
    },
    bind_hashchange: function() {
        var self = this;
        $(window).bind('hashchange', this.on_hashchange);

        var state = $.bbq.getState(true);
        if (! _.isEmpty(state)) {
            $(window).trigger('hashchange');
        } else {
            self.menu.has_been_loaded.then(function() {
                var first_menu_id = self.menu.$element.find("a:first").data("menu");
                if(first_menu_id) {
                    self.menu.menu_click(first_menu_id);
                }
            });
        }
    },
    on_hashchange: function(event) {
        var self = this;
        var state = event.getState(true);
        if (!_.isEqual(this._current_state, state)) {
            if(state.action_id === undefined && state.menu_id) {
                self.menu.has_been_loaded.then(function() {
                    self.menu.do_reload().then(function() {
                        self.menu.menu_click(state.menu_id)
                    });
                });
            } else {
                this.action_manager.do_load_state(state, !!this._current_state);
            }
        }
        this._current_state = state;
    },
    do_push_state: function(state) {
        var url = '#' + $.param(state);
        this._current_state = _.clone(state);
        $.bbq.pushState(url);
    },
    on_menu_action: function(action) {
        this.action_manager.do_action(action);
    },
    do_action: function(action) {
        var self = this;
        // TODO replace by client action menuclick
        if(action.menu_id) {
            this.do_reload().then(function () {
                self.menu.menu_click(action.menu_id);
            });
        }
    },
    set_content_full_screen: function(fullscreen) {
        if (fullscreen)
            $(".oe_webclient", this.$element).addClass("oe_content_full_screen");
        else
            $(".oe_webclient", this.$element).removeClass("oe_content_full_screen");
    }
});

instance.web.EmbeddedClient = instance.web.Widget.extend({
    template: 'EmptyComponent',
    init: function(parent, action_id, options) {
        this._super(parent);
        // TODO take the xmlid of a action instead of its id
        this.action_id = action_id;
        this.options = options || {};
        this.am = new instance.web.ActionManager(this);
    },
    start: function() {
        var self = this;
        this.am.appendTo(this.$element.addClass('openerp'));
        return this.rpc("/web/action/load", { action_id: this.action_id }, function(result) {
            var action = result.result;
            action.flags = _.extend({
                //views_switcher : false,
                search_view : false,
                action_buttons : false,
                sidebar : false
                //pager : false
            }, self.options, action.flags || {});

            self.am.do_action(action);
        });
    }
});

instance.web.embed = function (origin, dbname, login, key, action, options) {
    $('head').append($('<link>', {
        'rel': 'stylesheet',
        'type': 'text/css',
        'href': origin +'/web/webclient/css'
    }));
    var currentScript = document.currentScript;
    if (!currentScript) {
        var sc = document.getElementsByTagName('script');
        currentScript = sc[sc.length-1];
    }
    instance.connection.session_bind(origin).then(function () {
        instance.connection.session_authenticate(dbname, login, key, true).then(function () {
            var client = new instance.web.EmbeddedClient(null, action, options);
            client.insertAfter(currentScript);
        });
    });

};

};

// vim:et fdc=0 fdl=0 foldnestmax=3 fdm=syntax:
