"use client";

import {
  AuthenticationDetails,
  CognitoUser,
  CognitoUserAttribute,
  CognitoUserPool,
  CognitoUserSession,
} from "amazon-cognito-identity-js";
import { CONFIG, authConfigured } from "./config";

let pool: CognitoUserPool | null = null;
function getPool(): CognitoUserPool {
  if (!authConfigured()) throw new Error("Cognito not configured");
  if (!pool) {
    pool = new CognitoUserPool({
      UserPoolId: CONFIG.cognito.userPoolId,
      ClientId: CONFIG.cognito.clientId,
    });
  }
  return pool;
}

export type Session = { idToken: string; email: string; sub: string };

export async function signIn(email: string, password: string): Promise<Session> {
  const user = new CognitoUser({ Username: email, Pool: getPool() });
  const details = new AuthenticationDetails({ Username: email, Password: password });
  return new Promise<Session>((resolve, reject) => {
    user.authenticateUser(details, {
      onSuccess: (s) => resolve(toSession(s)),
      onFailure: reject,
      newPasswordRequired: () => reject(new Error("new password required — sign up first")),
    });
  });
}

export async function signUp(email: string, password: string): Promise<void> {
  return new Promise((resolve, reject) => {
    getPool().signUp(email, password, [new CognitoUserAttribute({ Name: "email", Value: email })], [], (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

export async function confirmSignUp(email: string, code: string): Promise<void> {
  const user = new CognitoUser({ Username: email, Pool: getPool() });
  return new Promise((resolve, reject) => {
    user.confirmRegistration(code, true, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

export function signOut(): void {
  const u = getPool().getCurrentUser();
  u?.signOut();
}

export async function currentSession(): Promise<Session | null> {
  if (!authConfigured()) return null;
  const u = getPool().getCurrentUser();
  if (!u) return null;
  return new Promise<Session | null>((resolve) => {
    u.getSession((err: Error | null, s: CognitoUserSession | null) => {
      if (err || !s || !s.isValid()) {
        resolve(null);
        return;
      }
      resolve(toSession(s));
    });
  });
}

function toSession(s: CognitoUserSession): Session {
  const idToken = s.getIdToken();
  const payload = idToken.decodePayload() as { email?: string; sub?: string };
  return {
    idToken: idToken.getJwtToken(),
    email: payload.email ?? "",
    sub: payload.sub ?? "",
  };
}
