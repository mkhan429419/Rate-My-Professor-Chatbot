import { SignIn } from "@clerk/nextjs";
import React from "react";

const SignInPage = () => {
  return (
    <main className="flex items-center justify-center min-h-screen bg-gradient-to-br from-[#E5D9F2] to-[#CDC1FF]">
      <SignIn forceRedirectUrl="/chat" />
    </main>
  );
};

export default SignInPage;
