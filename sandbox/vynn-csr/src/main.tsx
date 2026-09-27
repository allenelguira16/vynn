import "./main.css";

import { App } from "./app";
import { renderToDOM } from "vynn/render";

renderToDOM(App, "#app");

// function App() {
//   const count = $state(0);

//   $effect(() => {
//     console.log(count.value);
//   });

//   return (
//     <div>
//       <div>Counter: {count.value}</div>
//       <button onClick={() => count.value++}>+</button>
//       <button onClick={() => count.value--}>-</button>
//     </div>
//   );
// }

// function App() {
//   const [count, setCount] = useState(0);

//   useState(() => {
//     console.log(count);
//   }, [count]);

//   return (
//     <div>
//       <div>Counter: {count}</div>
//       <button onClick={() => setCount(count + 1)}>+</button>
//       <button onClick={() => setCount(count - 1)}>-</button>
//     </div>
//   );
// }
