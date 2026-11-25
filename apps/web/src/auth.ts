import { AuthenticationDetails, CognitoUser, CognitoUserPool } from "amazon-cognito-identity-js";

const pool = new CognitoUserPool({
  UserPoolId: import.meta.env.VITE_COGNITO_USER_POOL_ID ?? "us-east-1_placeholder",
  ClientId: import.meta.env.VITE_COGNITO_CLIENT_ID ?? "placeholder",
});

export function signIn(email: string, password: string): Promise<string> {
  const user = new CognitoUser({ Username: email, Pool: pool });
  return new Promise((resolve, reject) =>
    user.authenticateUser(new AuthenticationDetails({ Username: email, Password: password }), {
      onSuccess: (s) => resolve(s.getIdToken().getJwtToken()),
      onFailure: reject,
      newPasswordRequired: () => reject(new Error("Yeni parola gerekli.")),
    }),
  );
}

export function signUp(email: string, password: string): Promise<void> {
  return new Promise((resolve, reject) =>
    pool.signUp(email, password, [], [], (err) => (err ? reject(err) : resolve())),
  );
}

export function confirmSignUp(email: string, code: string): Promise<void> {
  const user = new CognitoUser({ Username: email, Pool: pool });
  return new Promise((resolve, reject) =>
    user.confirmRegistration(code, true, (err) => (err ? reject(err) : resolve())),
  );
}
