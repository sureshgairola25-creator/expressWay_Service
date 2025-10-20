const swaggerLib = require('express-swagger-generator');

module.exports = (app, baseDir) => {
  const swagger = swaggerLib(app);

  const options = {
    route: {
      url: '/v2/api-docs',
      docs: '/v2/api-docs.json',
    },
    swaggerDefinition: {
      info: {
        description: 'This is the API documentation for Vibravid Marketplace',
        title: 'Vibravid Marketplace API',
        version: '1.0.0',
      },
      host: 'localhost:3011',
      basePath: '/v2',
      produces: ['application/json', 'application/xml'],
      schemes: ['http', 'https'],
      securityDefinitions: {
        Bearer_Token: {
          type: 'apiKey',
          in: 'header',
          name: 'Authorization',
          description: '',
        },
      },
    },
    basedir: baseDir || __dirname,
    files: ['./v2/routes/*.js'],
  };

  swagger(options);
};
