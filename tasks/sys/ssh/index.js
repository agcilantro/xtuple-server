var lib = require('xtuple-server-lib'),
  fs = require('fs'),
  rimraf = require('rimraf'),
  exec = require('child_process').execSync,
  path = require('path'),
  _ = require('lodash');

/**
 * Configure ssh access policy
 */
_.extend(exports, lib.task, /** @exports policy */ {

  /** @override */
  executeTask: function (options) {
    exports.configure(options);
  },

  /**
   * Configure SSH remote access rules. Needs to be idempotent.
   * @private
   */
  configure: function  (options) {
    var src_sshd_conf = fs.readFileSync('/etc/ssh/sshd_config').toString(),
      rules = {
        UseDNS: 'no',
        PermitRootLogin: 'no',
        //AllowGroups: 'xtadmin xtuser', // TODO solve riskiness of installing over ssh
        LoginGraceTime: '30s',
        ClientAliveInterval: '60',
        ClientAliveCountMax: '60',  // keep session alive for one hour
        PasswordAuthentication: 'yes',
        //X11Forwarding: 'no',
        //PubkeyAuthentication: 'no',
        HostbasedAuthentication: 'no'
      },
      target_sshd_conf = _.reduce(_.keys(rules), function (memo, key) {
        var regex = new RegExp('^' + key + '.*$', 'gm'),
          entry = key + ' ' + rules[key],
          match = regex.exec(memo);

        return match ? memo.replace(match, entry) : memo.concat(entry + '\n');
      }, src_sshd_conf);

    fs.writeFileSync('/etc/ssh/sshd_config.bak.' + new Date().valueOf(), src_sshd_conf);
    fs.writeFileSync('/etc/ssh/sshd_config', target_sshd_conf);
  }
});
