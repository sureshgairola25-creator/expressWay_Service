// Configuration for jwt token to secure path

let { expressjwt: jwt } = require("express-jwt");

const jwtToken = require('jsonwebtoken');

module.exports = {
  auth: jwt({
    secret: process.env.JWT_SECRET,
    algorithms: ['sha1', 'RS256', 'HS256'],
    userProperty: process.env.JWT_PROPERTY,
  }),
  generateToken: async function (userInfo) {
    const expiry = new Date();
    expiry.setDate(expiry.getMinutes() + 1);
    return jwtToken.sign(
      {
        _id: userInfo._id,
        fullName: userInfo.fullName,
        email: userInfo.email,
        userType: userInfo.userType,
        userName: userInfo.userName,
        account: userInfo.account,
        profilePic: userInfo.profilePic,
      },
      process.env.JWT_SECRET,
      { expiresIn: '24h' },
    );
  },
};
