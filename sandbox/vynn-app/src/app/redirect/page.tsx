import { redirect } from "vynn-router";

export const beforeLoad = async () => {
  console.log("hi");
  redirect("/params/1?id=1");
};

export default function RedirectPage() {
  return <div>I'm a redirecting page and shouldn't be seen in the browser</div>;
}
