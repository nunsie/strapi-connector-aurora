'use strict';

/**
 * Module dependencies
 */

// Public node modules.
const _ = require('lodash');

const knexDataApiClient = require('knex-aurora-data-api-client');
const Bluebird = require('bluebird');

Object.assign(knexDataApiClient.mysql.prototype, {
  acquireConnection() {
    const connection = this._driver(this.connectionSettings);
    return Bluebird.resolve(connection);
    // return Promise.resolve(connection);
  },
});

/**
 * Knex hook
 */

module.exports = (strapi) => {
  // For each connection in the config register a new Knex connection.
  _.forEach(
    _.pickBy(strapi.config.connections, {
      connector: 'bookshelf',
    }),
    (connection, name) => {
      // Make sure we use the client even if the typo is not the exact one.
      switch (connection.settings.client) {
        case 'pg':
        case 'postgre':
        case 'postgresql':
          connection.settings.client = 'postgres';
          break;
      }

      const client = knexDataApiClient[connection.settings.client];

      const options = _.defaultsDeep(
        {
          client,
          connection: {
            secretArn: _.get(connection.settings, 'secretArn'),
            resourceArn: _.get(connection.settings, 'resourceArn'),
            database: _.get(connection.settings, 'database'),
            region: _.get(connection.settings, 'region'),
          },
          ...connection.options,
          debug: _.get(connection.options, 'debug', false),
          pool: {
            ..._.get(connection.options, 'pool', {}),
            min: _.get(connection.options, 'pool.min', 0),
          },
        },
        strapi.config.hook.settings.knex,
        defaultConfig
      );

      switch (options.client) {
        case 'mysql':
          options.connection.supportBigNumbers = true;
          options.connection.bigNumberStrings = true;
          options.connection.typeCast = (field, next) => {
            if (field.type == 'DECIMAL' || field.type === 'NEWDECIMAL') {
              var value = field.string();
              return value === null ? null : Number(value);
            }

            if (field.type == 'TINY' && field.length == 1) {
              let value = field.string();
              return value ? value == '1' : null;
            }
            return next();
          };
          break;
        case 'postgres':
          client.types.setTypeParser(1700, 'text', parseFloat);

          if (_.isString(_.get(options.connection, 'schema'))) {
            options.pool = {
              ...options.pool,
              afterCreate: (conn, cb) => {
                conn.query(`SET SESSION SCHEMA '${options.connection.schema}';`, (err) => {
                  cb(err, conn);
                });
              },
            };
          } else {
            delete options.connection.schema;
          }
          break;
      }

      // Finally, use the client via `knex`.
      // If anyone has a solution to use different paths for `knex` and clients
      // please drop us an email at support@strapi.io-- it would avoid the Strapi
      // applications to have `knex` as a dependency.
      try {
        // Try to require from local dependency.
        const connection = require('knex')(options);
        _.set(strapi, `connections.${name}`, connection);
      } catch (err) {
        strapi.log.error('Impossible to use the `' + name + '` connection...');
        strapi.log.warn(
          'Be sure that your client `' + name + '` are in the same node_modules directory'
        );
        strapi.log.error(err);
        strapi.stop();
      }
    }
  );
};
