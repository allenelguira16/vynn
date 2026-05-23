import "./main.css";

import { App } from "@vynn/common";
import { createApp } from "vynn/client";

createApp(() => {
  return <App url={location.pathname} />;
}).mount("#app");

// const app = createApp(() => {
//   const count = $state(0);

//   const msg = resource(async () => {
//     console.log("called");
//     await sleep(5000);

//     return "FROM RESOURCE";
//   }, []);

//   setInterval(() => {
//     count.value++;
//   }, 1000);
//   const toggle = $state(false);
//   onMount(() => {
//     console.log("MOUNTED?");
//   });
//   onDestroy(() => {
//     console.log("DESTROYED...");
//   });

//   return (
//     <div>
//       <div>Test</div>
//       <div>
//         {/* <Suspense fallback={<div>"Loading..."</div>}> */}
//         <span>Title</span>
//         <div>Hello World!</div>
//         {/* <div>{msg.data}</div> */}
//         {/* {toggle.value && <div>BISAYA KA?</div>}
//           <button onClick={() => (toggle.value = !toggle.value)}>Toggle</button> */}
//         <div>
//           <button onClick={() => (toggle.value = !toggle.value)}>Toggle</button>
//         </div>
//         {toggle.value && (
//           <>
//             <div>BISAYA KA?</div>
//             <div>Huh?</div>
//           </>
//         )}
//         <div>Hi</div>
//         <div>Counter: {count.value}</div>
//         {/* </Suspense> */}
//       </div>
//       {/* <button onClick={() => app.unmount()}>Unmount</button> */}
//     </div>
//   );
// });

// app.mount("#app");
