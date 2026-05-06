export const CONFIG = {
  apiUrl: process.env.NEXT_PUBLIC_API_URL ?? "",
  cognito: {
    userPoolId: process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID ?? "",
    clientId: process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID ?? "",
    region: process.env.NEXT_PUBLIC_COGNITO_REGION ?? "ap-southeast-1",
  },
};

export const authConfigured = (): boolean =>
  Boolean(CONFIG.cognito.userPoolId && CONFIG.cognito.clientId);

export const apiConfigured = (): boolean => Boolean(CONFIG.apiUrl);
