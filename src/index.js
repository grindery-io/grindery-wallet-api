import express from 'express';
import pkg from 'body-parser';
import expressJSDocSwagger from 'express-jsdoc-swagger';
import path from 'path';
import { fileURLToPath } from 'url';
import './loadEnvironment.js';
import router from './router.js';
import appPackage from '../package.json';

const { json, urlencoded } = pkg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const options = {
  info: {
    version: appPackage.version || '0.0.1',
    title: 'Grindery Wallet API',
    description: appPackage.description || '',
    license: {
      name: appPackage.license || 'MIT',
    },
  },
  security: {
    BearerAuth: {
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT',
    },
  },
  servers: [
    {
      url: 'https://wallet-api.grindery.io',
      description: 'Production server',
    },
    {
      url: 'https://wallet-api-staging.grindery.io',
      description: 'Staging server',
    },
  ],
  // Base directory which we use to locate your JSDOC files
  baseDir: __dirname,
  // Glob pattern to find your jsdoc files (multiple patterns can be added in an array)
  filesPattern: './**/*.js',
  // URL where SwaggerUI will be rendered
  swaggerUIPath: '/docs',
  // Expose OpenAPI UI
  exposeSwaggerUI: true,
  // Expose Open API JSON Docs documentation in `apiDocsPath` path.
  exposeApiDocs: true,
  // Open API JSON Docs endpoint.
  apiDocsPath: '/openapi',
  // Set non-required fields as nullable by default
  notRequiredAsNullable: false,
  // You can customize your UI options.
  // you can extend swagger-ui-express config. You can checkout an example of this
  // in the `example/configuration/swaggerOptions.js`
  swaggerUiOptions: {},
  // multiple option in case you want more that one instance
  multiple: false,
};

const app = express();

expressJSDocSwagger(app)(options);

app.set('trust proxy', 1);

// Force SSL
// No need on GCP
// app.use(sslRedirect());

// Enable CORS
app.use(function (req, res, next) {
  // res.header("Access-Control-Allow-Origin", "*");
  res.header('Access-Control-Allow-Origin', req.get('origin'));
  res.header(
    'Access-Control-Allow-Headers',
    'X-CSRFToken, Origin, X-Requested-With, Content-Type, Accept, Authorization'
  );
  res.header('Access-Control-Allow-Credentials', true);
  res.header(
    'Access-Control-Allow-Methods',
    'HEAD,OPTIONS,GET,POST,PUT,PATCH,DELETE'
  );

  if (req.method === 'OPTIONS') {
    // Return OK response for CORS preflight
    res.json({ message: 'Ok' });
  } else {
    next();
  }
});

// JSON Parser
const bodyParserAddRawBody = (req, res, buf, encoding) => {
  req.rawBody = buf.toString();
};
app.use(
  json({
    verify: bodyParserAddRawBody,
  })
);
app.use(
  urlencoded({
    extended: false,
    verify: bodyParserAddRawBody,
  })
);

app.get('/', (req, res) => {
  // res.redirect("/docs");
  // GCP expects 200 response for root url
  res
    .set('Content-Type', 'text/html')
    .send("<script>location.href = '/docs'</script>");
});

const port = process.env.PORT || 3000;

const server = app.listen(port, function () {
  console.log(`Wallet API listening on port ${port}`);
});

app.use('/v1/', router);

export default app;
