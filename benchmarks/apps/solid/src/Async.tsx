import { createMemo, createSignal, Loading } from "solid-js";

export default function Async() {
  const [userId, setUserId] = createSignal(1);
  const user = createMemo(async () => {
    const id = userId();
    await Promise.resolve();
    return { id, name: `User ${id}` };
  });

  return (
    <main>
      <h1>Async memo</h1>
      <button type="button" onClick={() => setUserId(value => value + 1)}>
        Next user
      </button>
      <Loading fallback={<p>Loading...</p>} on={userId()}>
        <p>{user().name}</p>
      </Loading>
    </main>
  );
}
