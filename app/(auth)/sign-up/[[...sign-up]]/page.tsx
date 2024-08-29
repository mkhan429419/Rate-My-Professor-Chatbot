import { SignUp } from "@clerk/nextjs";
import React from "react";

const SignUpPage = () => {
  return (
    <main className="flex items-center justify-center min-h-screen bg-gradient-to-br from-[#E5D9F2] to-[#CDC1FF]">
      <SignUp forceRedirectUrl="/chat" />
    </main>
  );
};

export default SignUpPage;
