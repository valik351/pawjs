import path from 'path';
import express from 'express';
import webpack from 'webpack';
import webpackMiddleware from 'webpack-dev-middleware';
import webpackHotMiddleware from 'webpack-hot-middleware';
import webLog from 'webpack-log';
import pawConfig from '../config';
import directories from '../webpack/utils/directories';
import wHandler from '../webpack';
// Utils
// -- Require from string. create an export from string like `module.export = "Something";`
import requireFromString from '../webpack/utils/requireFromString';
// Assets normalizer appending publicPath
import normalizeAssets from '../webpack/utils/normalizeAssets';

// Notify the user that compilation has started and should be done soon.

// eslint-disable-next-line
console.log(`
===================================================
  Compiling files.
  This may take time depending on the application size.
  Thank you for your patience.
===================================================
`);
wHandler.hooks.beforeConfig.tap('AddHotReplacementPlugin', (wEnv, wType, wConfigs) => {
  // Add eval devtool to all the configs
  wConfigs.forEach((wConfig) => {
    if (!wConfig.devtool) {
      /* eslint-disable */
      wConfig.devtool = 'eval';
      if (!wConfig.resolve) wConfig.resolve = {};
      if (!wConfig.resolve.alias) wConfig.resolve.alias = {};
      if (!wConfig.resolve.alias['react-dom']) wConfig.resolve.alias['react-dom'] = '@hot-loader/react-dom';
      /* eslint-enable */
    }
  });


  // Web specific configurations
  if (wType === 'web') {
    wConfigs.forEach((wConfig) => {
      if (
        wConfig.entry.client
        && Array.isArray(wConfig.entry.client)
      ) {
        let clientIndex = wConfig.entry.client.indexOf(path.resolve(process.env.LIB_ROOT, 'src', 'client', 'app.js'));

        // Add webpack-hot-middleware as entry point
        const hotMiddlewareString = 'webpack-hot-middleware/client?name=web&path=/__hmr_update&timeout=2000&overlay=true&quiet=false';
        if (!wConfig.entry.client.includes(hotMiddlewareString)) {
          if (clientIndex === -1) {
            wConfig.entry.client.unshift(hotMiddlewareString);
          } else {
            wConfig.entry.client.splice(clientIndex, 0, hotMiddlewareString);
            clientIndex += 1;
          }
        }

        // Replace app with hot-app
        if (wConfig.entry.client.includes(path.resolve(process.env.LIB_ROOT, 'src', 'client', 'app.js'))) {
          // eslint-disable-next-line
          wConfig.entry.client[clientIndex] = path.resolve(process.env.LIB_ROOT, 'src', 'client', 'hot-app.js');
        }

        // check for Hot Module replacement plugin and add it if necessary
        const hasHotPlugin = wConfig
          .plugins
          .some(p => p instanceof webpack.HotModuleReplacementPlugin);

        if (!hasHotPlugin) {
          wConfig.plugins.unshift(new webpack.HotModuleReplacementPlugin({
            multiStep: true,
          }));
        }
      }
    });
  }


  if (wType === 'server') {
    wConfigs.forEach((wConfig) => {
      // Add express as externals
      if (!wConfig.externals) {
        // eslint-disable-next-line
        wConfig.externals = {};
      }
      // eslint-disable-next-line
      wConfig.externals.express = 'express';


      // do not emit image files for server!
      wConfig.module.rules.forEach((rule) => {
        // eslint-disable-next-line
        rule.use && Array.isArray(rule.use) && rule.use.forEach((u) => {
          if (u.loader && u.loader === 'file-loader') {
            // eslint-disable-next-line
            if (!u.options) u.options = {};
            // eslint-disable-next-line
            u.options.emitFile = typeof u.options.emitFile !== 'undefined' ? u.options.emitFile : false;
          }
        });
      });
    });
  }
});


try {
  // Server configurations
  const serverConfig = wHandler.getConfig(process.env.PAW_ENV, 'server');

  // Web client configurations
  const webConfig = wHandler.getConfig(process.env.PAW_ENV, 'web');

  const devServerConfig = {
    port: pawConfig.port,
    host: pawConfig.host,
    serverSideRender: pawConfig.serverSideRender,
    publicPath: pawConfig.resourcesBaseUrl,
    contentBase: path.join(directories.src, 'public'),
  };

  // Create new logging entity, pawjs
  const log = webLog({
    name: 'pawjs',
  });

  const processEnv = process.env;
  const isVerbose = processEnv.PAW_VERBOSE === 'true';

  const commonOptions = {
    stats: {
      colors: true,
      reasons: isVerbose,
      entrypoints: isVerbose,
      modules: isVerbose,
      moduleTrace: isVerbose,
      assets: true,
      warnings: isVerbose,
      errors: true,
      cachedAssets: isVerbose,
      version: isVerbose,
    },
    logger: log,
    logLevel: 'debug',
    noInfo: !isVerbose,
    hot: true,
  };

  const serverOptions = Object.assign({}, commonOptions, devServerConfig);
  const webOptions = Object.assign({}, commonOptions, {
    inline: true,
    serverSideRender: true,
    publicPath: pawConfig.resourcesBaseUrl,
  });

  // Create a webpack server compiler from the server config
  const serverCompiler = webpack(serverConfig);

  // Create a webpack web compiler from the web configurations
  const webCompiler = webpack(webConfig);

  const app = express();

  // Global for application
  const PAW_GLOBAL = {};

  // Disable x-powered-by for all requests
  app.set('x-powered-by', 'PawJS');

  // Add server middleware
  const serverMiddleware = webpackMiddleware(serverCompiler, serverOptions);
  app.use(serverMiddleware);


  const getCommonServer = () => {
    const mfs = serverMiddleware.fileSystem;
    // Get content of the server that is compiled!
    const serverContent = mfs.readFileSync(serverMiddleware.getFilenameFromUrl(`${serverOptions.publicPath}/server.js`), 'utf-8');

    return requireFromString(serverContent, {
      appendPaths: process.env.NODE_PATH.split(path.delimiter),
    });
  };
  // Add web middleware
  const webMiddleware = webpackMiddleware(webCompiler, webOptions);

  // On adding this middleware the SSR data to serverMiddleware will be lost in
  // res.locals but its not needed anyway.
  app.use(webMiddleware);

  // Add hot middleware to the update
  app.use(webpackHotMiddleware(webCompiler, {
    log: false,
    path: '/__hmr_update',
    heartbeat: 2000,
  }));

  app.use(pawConfig.appRootUrl, express.static(serverOptions.contentBase));

  /**
   * Below is where the magic happens!
   * We import the compiled server.js file as string and run it as module
   * thus we can get a fast experience of compilation and developer can
   * develop code with SSR enabled.
   */
  app.use((req, res, next) => {
    const mfs = serverMiddleware.fileSystem;
    const fileNameFromUrl = serverMiddleware
      .getFilenameFromUrl(serverOptions.publicPath + req.path);

    // If the request is for static file, do not compute or send data to
    // server just execute the express default next functionality
    // to let it manage itself.
    if (
      // if the request is for favicon
      fileNameFromUrl.indexOf('favicon.ico') !== -1 || (
        // if the request exists in middleware filesystem
        mfs.existsSync(fileNameFromUrl)
        // and the request is for a file
        && mfs.statSync(fileNameFromUrl).isFile()
      )
    ) {
      return next();
    }


    let CommonServerMiddleware;
    try {
      // Get content of the server that is compiled!
      const CommonServer = getCommonServer();
      CommonServerMiddleware = CommonServer.default;

      const { cssDependencyMap, ...assets } = normalizeAssets(res.locals.webpackStats);
      res.locals.assets = assets;
      res.locals.cssDependencyMap = cssDependencyMap;

      return CommonServerMiddleware(req, res, next, PAW_GLOBAL);
    } catch (ex) {
      // eslint-disable-next-line
      console.log(ex);
    }
    // Console.log
    return next();
  });

  let serverStarted = false;

  const startServer = () => {
    if (serverStarted) return;


    let beforeStart; let afterStart = null;
    try {
      const CommonServer = getCommonServer();
      // eslint-disable-next-line
      beforeStart = CommonServer.beforeStart;
      // eslint-disable-next-line
      afterStart = CommonServer.afterStart;
    } catch (ex) {
      // eslint-disable-next-line
      console.log(ex);
    }


    const nodeServerConfig = {
      port: devServerConfig.port,
      host: devServerConfig.host,
    };

    beforeStart(nodeServerConfig, PAW_GLOBAL, (err) => {
      if (err) {
        // eslint-disable-next-line
        console.error(err);
        return;
      }

      app.listen(nodeServerConfig.port, nodeServerConfig.host, () => {
        serverStarted = true;
        // eslint-disable-next-line
        console.log(`

===================================================
  Listening to http://${nodeServerConfig.host}:${nodeServerConfig.port}
  Open the above url in your browser.
===================================================
      `);
        afterStart(PAW_GLOBAL);
      });
    });
  };

  let totalCompilationComplete = 0;
  webCompiler.hooks.done.tap('InformWebCompiled', () => {
    totalCompilationComplete += 1;
    if (totalCompilationComplete >= 2) startServer();
  });

  serverCompiler.hooks.done.tap('InformServerCompiled', () => {
    totalCompilationComplete += 1;
    if (totalCompilationComplete >= 2) startServer();
  });
} catch (ex) {
  // eslint-disable-next-line
  console.log(ex);
}
