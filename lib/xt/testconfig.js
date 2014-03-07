(function () {
  'use strict';

  var format = require('string-format'),
    path = require('path'),
    fs = require('fs'),
    _ = require('underscore'),
    m = require('mstring'),
    config_template = m(function () {
      /***
        (function () {
          'use strict';

          exports.data = {json};
        })();

      ***/
    });

  var testconfig = exports;

  _.extend(testconfig, /** @exports testconfig */ {

    run: function (options) {
      var xt = options.xt,
        input_path = path.resolve(xt.srcdir, 'test/lib/sample_login_data'),
        output_path = path.resolve(xt.srcdir, 'test/lib/login_data.js'),
        test_config = require(input_path),
        test_obj = JSON.parse(JSON.stringify(test_config)),
        output_config;

      _.extend(test_obj, {
        webaddress: 'https://localhost',
        username: 'admin',
        pwd: options.pg.adminpw,
        org: 'installtest'
      });

      output_config = config_template.format({ json: JSON.stringify(test_obj, null, 2) });

      if (options.dry !== true) {
        fs.writeFileSync(output_path, output_config);
      }

      return options;
    }
  });

})();