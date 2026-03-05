function getRolePermissions(role) {
  if (!role || !Array.isArray(role.permissions) || role.permissions.length === 0) {
    return {};
  }
  return role.permissions[0] || {};
}

function authorize(feature, action) {
  return (req, res, next) => {
    const user = req.user;
    if (!user || !user.role) {
      return res.status(403).json({
        status: "Fail",
        message: "Access denied",
      });
    }

    const perms = getRolePermissions(user.role);
    const featurePerms = perms[feature];

    if (!featurePerms || !featurePerms[action]) {
      return res.status(403).json({
        status: "Fail",
        message: "Access denied",
      });
    }

    next();
  };
}

function leadReadScope() {
  return (req, res, next) => {
    const user = req.user;
    if (!user || !user.role) {
      return res.status(403).json({
        status: "Fail",
        message: "Access denied",
      });
    }

    const perms = getRolePermissions(user.role);
    const leadPerms = perms.lead || {};

    if (leadPerms.readAll) {
      req.leadScope = "all";
      return next();
    }

    if (leadPerms.readOwn) {
      req.leadScope = "own";
      return next();
    }

    return res.status(403).json({
      status: "Fail",
      message: "Access denied",
    });
  };
}

module.exports = {
  authorize,
  leadReadScope,
};

