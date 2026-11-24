import { Suspense, use } from "preact/compat";
import { useState } from "preact/hooks";

type User = { id: number; name: string };

const users = new Map<number, Promise<User>>();

function getUser(id: number) {
  let user = users.get(id);

  if (!user) {
    user = Promise.resolve().then(() => ({ id, name: `User ${id}` }));
    users.set(id, user);
  }

  return user;
}

function UserDetails({ id }: { id: number }) {
  const user = use(getUser(id));
  return <p>{user.name}</p>;
}

export default function Async() {
  const [userId, setUserId] = useState(1);

  return (
    <main>
      <h1>Async memo</h1>
      <button type="button" onClick={() => setUserId((value) => value + 1)}>
        Next user
      </button>
      <Suspense fallback={<p>Loading...</p>}>
        <UserDetails id={userId} />
      </Suspense>
    </main>
  );
}
