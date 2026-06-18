import ApiError from "../utils/ApiError.js";
import authService from "../services/authService.js";

export const login = async (req, res) => {
  const result = await authService.login({
    username: req.body?.username,
    password: req.body?.password,
  });

  res.status(200).json({
    success: true,
    message: "Login successful",
    data: {
      token: result.token,
      user: result.user,
      permissions: result.permissions,
    },
  });
};

export const getProfile = async (req, res) => {
  const userId = Number(req.user?.id ?? req.user?.sub);

  if (!userId) {
    throw new ApiError(401, "Authentication token is required");
  }

  const profile = await authService.loadUserAuthProfile(userId);

  if (!profile) {
    throw new ApiError(404, "User not found");
  }

  res.status(200).json({
    success: true,
    data: {
      user: profile,
      permissions: profile.permissions,
    },
  });
};
