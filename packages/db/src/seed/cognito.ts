import {
  AdminCreateUserCommand, AdminGetUserCommand, AdminSetUserPasswordCommand, CognitoIdentityProviderClient, UserNotFoundException,
} from "@aws-sdk/client-cognito-identity-provider";
import { users } from "./l1-data";

/** Test kullanıcılarını oluşturur/günceller; parola ortam değişkeninden gelir ve hiçbir yere yazılmaz. */
export async function ensureCognitoUsers(userPoolId: string, password: string, log: (m: string) => void = console.log): Promise<Map<string, string>> {
  const client = new CognitoIdentityProviderClient({});
  const subs = new Map<string, string>();
  for (const u of users) {
    let sub: string | undefined;
    try {
      const got = await client.send(new AdminGetUserCommand({ UserPoolId: userPoolId, Username: u.email }));
      sub = got.UserAttributes?.find((a) => a.Name === "sub")?.Value;
    } catch (e) {
      if (!(e instanceof UserNotFoundException)) throw e;
      const created = await client.send(new AdminCreateUserCommand({
        UserPoolId: userPoolId, Username: u.email, MessageAction: "SUPPRESS",
        UserAttributes: [{ Name: "email", Value: u.email }, { Name: "email_verified", Value: "true" }],
      }));
      sub = created.User?.Attributes?.find((a) => a.Name === "sub")?.Value;
    }
    await client.send(new AdminSetUserPasswordCommand({ UserPoolId: userPoolId, Username: u.email, Password: password, Permanent: true }));
    if (!sub) throw new Error(`sub alınamadı: ${u.email}`);
    subs.set(u.email, sub);
  }
  log(`  cognito: ${subs.size} kullanıcı hazır`);
  return subs;
}
