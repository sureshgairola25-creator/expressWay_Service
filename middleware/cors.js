const cors = require('cors');

module.exports = (app) => {
  const whitelist = JSON.parse(process.env.WHITELIST_URL);
  const corsOptions = {
    origin: function (origin, callback) {
      if (whitelist.indexOf(origin) !== -1 || !origin) {
        callback(null, true);
        return;
      }

      callback(new Error('Invalid Origin'));
    },
    optionsSuccessStatus: 200, // some legacy browsers (IE11, various SmartTVs) choke on 204
    credentials: true,
  };

  app.use(cors(corsOptions));
};
