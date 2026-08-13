import { adminAuth } from "../src/backend/config/firebase-admin.ts";

async function bootstrap() {
  const email = "shakshay04@gmail.com";
  const password = "Brims@123";

  try {
    console.log(`Bootstrapping admin user: ${email}...`);
    
    let user;
    try {
      user = await adminAuth.getUserByEmail(email);
      console.log(`User already exists with UID: ${user.uid}. Updating password...`);
      await adminAuth.updateUser(user.uid, {
        password: password,
        emailVerified: true
      });
    } catch (error: any) {
      if (error.code === 'auth/user-not-found') {
        console.log("User not found. Creating new user...");
        user = await adminAuth.createUser({
          email: email,
          password: password,
          emailVerified: true,
          displayName: "Admin User"
        });
      } else {
        throw error;
      }
    }

    console.log(`Successfully bootstrapped admin user: ${email} (UID: ${user.uid})`);
    process.exit(0);
  } catch (error) {
    console.error("Bootstrap failed:", error);
    process.exit(1);
  }
}

bootstrap();
