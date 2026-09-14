import { mount } from "svelte";
import "../../../src/app.css";
import App from "./App.svelte";

mount(App, { target: document.getElementById("app")! });
