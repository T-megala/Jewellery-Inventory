export const USER_ROLES = {
  USER: "user",
  CEO: "ceo",
  ADMIN: "admin",
};

export const CEO_ROLE = USER_ROLES.CEO;

export const isCeoRole = (role) =>
  String(role ?? "")
    .trim()
    .toLowerCase() === USER_ROLES.CEO;
