openerp.test_support = {
    setup_connection: function (connection) {
        var origin = location.protocol+"//"+location.host;
        _.extend(connection, {
            origin: origin,
            prefix: origin,
            server: origin, // keep chs happy
            //openerp.web.qweb.default_dict['_s'] = this.origin;
            rpc_function: connection.rpc_json,
            session_id: false,
            uid: false,
            username: false,
            user_context: {},
            db: false,
            openerp_entreprise: false,
//            this.module_list = openerp._modules.slice();
//            this.module_loaded = {};
//            _(this.module_list).each(function (mod) {
//                self.module_loaded[mod] = true;
//            });
            context: {},
            shortcuts: [],
            active_id: null
        });
        return connection.session_reload();
    },
    module: function (title, tested_core, nonliterals) {
        var conf = QUnit.config.openerp = {};
        QUnit.module(title, {
            setup: function () {
                QUnit.stop();
                var oe = conf.openerp = window.openerp.init();
                window.openerp.web[tested_core](oe);
                var done = openerp.test_support.setup_connection(oe.connection);
                if (nonliterals) {
                    done = done.pipe(function () {
                        return oe.connection.rpc('/tests/add_nonliterals', {
                            domains: nonliterals.domains || [],
                            contexts: nonliterals.contexts || []
                        }).then(function (r) {
                            oe.domains = r.domains;
                            oe.contexts = r.contexts;
                        });
                    });
                }
                done.always(QUnit.start)
                    .then(function () {
                        conf.openerp = oe;
                    }, function (e) {
                        QUnit.test(title, function () {
                            console.error(e);
                            QUnit.ok(false, 'Could not obtain a session:' + e.debug);
                        });
                    });
            }
        });
    },
    test: function (title, fn) {
        var conf = QUnit.config.openerp;
        QUnit.test(title, function () {
            QUnit.stop();
            fn(conf.openerp);
        });
    },
    expect: function (promise, fn) {
        promise.always(QUnit.start)
               .done(function () { QUnit.ok(false, 'RPC requests should not succeed'); })
               .fail(function (e) {
            if (e.code !== 200) {
                QUnit.equal(e.code, 200, 'Testing connector should raise RPC faults');
                if (typeof console !== 'undefined' && console.error) {
                    console.error(e.data.debug);
                }
                return;
            }
            fn(e.data.fault_code);
        })
    }
};
