import { db, ensureAuth } from "../config/firebase-client.ts";
import { doc, getDoc } from "firebase/firestore";

async function inspectDoc() {
  await ensureAuth();
  const ref = doc(db, "users", "virtual-sourabhcho-sjunlptkf");
  const snap = await getDoc(ref);
  if (snap.exists()) {
    const data = snap.data();
    console.log("Fields:", Object.keys(data));
    console.log("hasPassword:", !!data.password);
    console.log("passwordLength:", data.password?.length);
    console.log("mfaEnabled:", data.mfaEnabled);
    console.log("hashedPassword:", !!data.hashedPassword);
  } else {
    console.log("Doc does not exist!");
  }
  process.exit(0);
}

inspectDoc();
