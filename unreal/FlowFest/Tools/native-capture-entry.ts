import { mount } from "svelte";
import Page from "../../../src/routes/test/flow-fest-native-export/+page.svelte";

const target = document.getElementById("app");
if (!target) throw new Error("Capture mount target is missing");
mount(Page, { target });
