var lib = require('xtuple-server-lib'),
  format = require('string-format'),
  _ = require('lodash'),
  exec = require('child_process').execSync,
  fs = require('fs'),
  os = require('os'),
  path = require('path'),
  phi = (Math.sqrt(5) + 1) / 2,
  MB = 1048576,
  GB = Math.pow(1048576, 2);

/**
 * Tuning strategies influenced by:
 * <http://pgfoundry.org/projects/pgtune/>
 * <http://wiki.postgresql.org/wiki/Tuning_Your_PostgreSQL_Server>
 */
_.extend(exports, lib.task, /** @exports tuner */ {

  options: {
    slots: {
      optional: '[int]',
      description: 'Number of provisioned "slots" to consume [1]',
      value: 1
    },
    capacity: {
      optional: '[int]',
      description: 'Number of provisioned "slots" available [1]',
      value: 4
    }
  },

  // scalar byte values are in MB
  env: {
    /**
     * <http://www.postgresql.org/docs/9.3/static/kernel-resources.html>
     * Docs: "if pages, ceil(SHMMAX/PAGE_SIZE)" ...and "A page is almost always
     * 4096 bytes except in unusual kernel configurations".
     */
    stacklimit: 8,
    shmmax: os.totalmem(),
    shmall: Math.ceil(os.totalmem() / 4096)
  },

  /** @override */
  beforeInstall: function (options) {
    options.pg.slotRatio = options.pg.slots / options.pg.capacity;
    options.pg.tunerEnv = exports.env;
    options.pg.clusterCount = _.size(lib.pgCli.lsclusters());

    // allow for one extra, due to potential default 'main' cluster
    if (options.pg.clusterCount >= options.pg.capacity + 1) {
      console.log('Warning: Over Capacity. max: {pg.capacity}, installed: {pg.clusterCount}'.format(options));
    }
  },

  /** @override */
  executeTask: function (options) {
    // set tuned values; config will be written by 'config' task
    _.extend(options.pg.config, {
      work_mem: work_mem(options),
      maintenance_work_mem: maintenance_work_mem(options),
      shared_buffers: shared_buffers(options),
      //max_stack_depth: max_stack_depth(options),
      effective_cache_size: effective_cache_size(options),
      max_connections: 128
    });

    exports.writeSysctlConfig(options);
  },

  /**
   * Tune the sysctl configs
   */
  writeSysctlConfig: function (options) {
    var sysctl_src_filename = '30-postgresql-shm.conf.template',
      sysctl_conf_path = path.resolve('/etc/sysctl.d/30-postgresql-shm.conf'),
      sysctl_conf_template = fs.readFileSync(path.resolve(__dirname, sysctl_src_filename)).toString(),
      sysctl_conf = sysctl_conf_template.format({
        shmmax: options.pg.tunerEnv.shmmax,
        shmall: options.pg.tunerEnv.shmall,
        semmsl: 256,
        semmns: 16777216,
        semopm: 128,
        semmni: 1024
      });

    fs.writeFileSync(sysctl_conf_path, sysctl_conf);
    try {
      exec('sysctl -p ' + sysctl_conf_path);
    }
    catch (e) {
      log.error('pg-tuner', 'Failed to reload sysctl config. The postgres server may experience problems.');
      log.error('pg-tuner', e.message);
    }
  }
});

function maintenance_work_mem (options) {
  if (options.type !== 'live') {
    return work_mem(options) * 4;
  }
  else {
    return work_mem(options) * 2;
  }
}

/**
 * http://www.postgresql.org/docs/current/static/runtime-config-resource.html#GUC-WORK-MEM
 */
function work_mem (options) {
  return Math.ceil(shared_buffers(options) / 64);
}

/**
 * <http://www.postgresql.org/docs/current/static/runtime-config-resource.html#GUC-SHARED-BUFFERS>
 */
function shared_buffers (options) {
  return Math.ceil(((os.totalmem() / 4) * options.pg.slotRatio) / MB);
}

/**
 * <http://www.postgresql.org/docs/current/static/runtime-config-query.html#GUC-EFFECTIVE-CACHE-SIZE>
 */
function effective_cache_size (options) {
  return Math.ceil((os.totalmem() * phi) / MB);
}

/**
 * <http://www.postgresql.org/docs/current/static/runtime-config-resource.html#GUC-MAX-STACK-DEPTH>
 */
function max_stack_depth (options) {
  return Math.floor((7/8) * options.pg.tunerEnv.stacklimit);
}
