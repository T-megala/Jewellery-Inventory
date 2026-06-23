export const MASTER_GROUPS = [
  {
    id: "organization",
    title: "Organization",
    items: [
      {
        to: "/branches",
        label: "Branches",
        description: "Showroom locations and branch setup",
        icon: "branches",
        permissions: ["branches.view", "branches.manage", "branches.view_all"],
      },
    ],
  },
  {
    id: "access",
    title: "Access",
    items: [
      {
        to: "/users",
        label: "Users",
        description: "Staff accounts and login access",
        icon: "users",
        permissions: ["users.view", "users.manage"],
      },
      {
        to: "/roles",
        label: "Roles",
        description: "Role definitions and permissions",
        icon: "roles",
        permissions: ["roles.view", "roles.manage"],
      },
    ],
  },
];

export const MASTER_PATHS = ["/masters", "/branches", "/users", "/roles"];
