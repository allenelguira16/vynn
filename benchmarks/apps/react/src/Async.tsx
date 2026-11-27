import { Suspense, use, useMemo, useState } from "react";

function User({ id }: { id: number }) {
  const promise = useMemo(
    () => Promise.resolve().then(() => ({ id, name: `User ${id}` })),
    [id],
  );
  const user = use(promise);
  return <p>{user.name}</p>;
}

export default function Async() {
  const [userId, setUserId] = useState(1);

  return (
    <main>
      <h1>Async memo</h1>
      <button type="button" onClick={() => setUserId(value => value + 1)}>
        Next user
      </button>
      <Suspense fallback={<p>Loading...</p>}>
        <User id={userId} />
      </Suspense>
    </main>
  );
}
