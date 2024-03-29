'use strict';

/**
 * Module dependencies
 */

// Core
const path = require('path');
const fs = require('fs');
// Public node modules.
const _ = require('lodash');
const bookshelf = require('bookshelf');

// Local helpers.
const relations = require('strapi-connector-bookshelf/lib/relations');
const buildQuery = require('strapi-connector-bookshelf/lib/buildQuery');
const mountModels = require('strapi-connector-bookshelf/lib/mount-models');
const getQueryParams = require('strapi-connector-bookshelf/lib/get-query-params');
const queries = require('strapi-connector-bookshelf/lib/queries');
const initKnex = require('./lib/knex');

/**
 * Bookshelf hook
 */

/**
 * Default options
 */

const defaults = {
  defaultConnection: 'default',
  host: 'localhost',
};

const isBookshelfConnection = ({ connector }) => connector === 'bookshelf';

module.exports = function (strapi) {
  function initialize() {
    initKnex(strapi);

    const { connections } = strapi.config;
    const GLOBALS = {};

    const connectionsPromises = Object.keys(connections)
      .filter((key) => isBookshelfConnection(connections[key]))
      .map((connectionName) => {
        const connection = connections[connectionName];

        _.defaults(connection.settings, strapi.config.hook.settings.bookshelf);

        // Create Bookshelf instance for this connection.
        const ORM = new bookshelf(strapi.connections[connectionName]);

        const initFunctionPath = path.resolve(
          strapi.config.appPath,
          'config',
          'functions',
          'bookshelf.js'
        );

        if (fs.existsSync(initFunctionPath)) {
          require(initFunctionPath)(ORM, connection);
        }

        const ctx = {
          GLOBALS,
          connection,
          ORM,
        };

        return Promise.all([
          mountComponents(connectionName, ctx),
          mountApis(connectionName, ctx),
          mountAdmin(connectionName, ctx),
          mountPlugins(connectionName, ctx),
        ]);
      });

    return Promise.all(connectionsPromises);
  }

  function mountComponents(connectionName, ctx) {
    const options = {
      models: _.pickBy(strapi.components, ({ connection }) => connection === connectionName),
      target: strapi.components,
    };

    return mountModels(options, ctx);
  }

  function mountApis(connectionName, ctx) {
    const options = {
      models: _.pickBy(strapi.models, ({ connection }) => connection === connectionName),
      target: strapi.models,
    };

    return mountModels(options, ctx);
  }

  function mountAdmin(connectionName, ctx) {
    const options = {
      models: _.pickBy(strapi.admin.models, ({ connection }) => connection === connectionName),
      target: strapi.admin.models,
    };

    return mountModels(options, ctx);
  }

  function mountPlugins(connectionName, ctx) {
    return Promise.all(
      Object.keys(strapi.plugins).map((name) => {
        const plugin = strapi.plugins[name];
        return mountModels(
          {
            models: _.pickBy(plugin.models, ({ connection }) => connection === connectionName),
            target: plugin.models,
          },
          ctx
        );
      })
    );
  }

  return {
    defaults,
    initialize,
    getQueryParams,
    buildQuery,
    queries,
    ...relations,
    get defaultTimestamps() {
      return ['created_at', 'updated_at'];
    },
  };
};
