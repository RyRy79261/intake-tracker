"use client";

import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SignInForm } from "./sign-in-form";
import { SignUpForm } from "./sign-up-form";

/**
 * The single sign-in / sign-up surface for the app. Middleware (middleware.ts)
 * redirects every unauthenticated page request here. Mobile-first layout with
 * the same max-w-lg container the rest of the app uses.
 */
export default function AuthPage() {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center">
          <CardTitle>Intake Tracker</CardTitle>
          <CardDescription>
            Sign in to access your health data
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="sign-in" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="sign-in">Sign In</TabsTrigger>
              <TabsTrigger value="sign-up">Sign Up</TabsTrigger>
            </TabsList>
            <TabsContent value="sign-in" className="mt-4">
              <SignInForm />
            </TabsContent>
            <TabsContent value="sign-up" className="mt-4">
              <SignUpForm />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
