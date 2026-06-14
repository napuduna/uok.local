import { redirect } from "next/navigation";

import { LoginForm } from "../../components/login-form";
import { getCurrentUser } from "../../lib/server-auth";

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) {
    redirect("/");
  }

  return <LoginForm />;
}
