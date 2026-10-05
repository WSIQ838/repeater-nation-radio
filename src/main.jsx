import React from "react";
import {createRoot} from "react-dom/client";
import "./styles.css";
import App from "./App";
import {IS_PHONE} from "./components/PhoneApp";
import "./phone.css";
if(IS_PHONE)document.documentElement.classList.add("phone");
createRoot(document.getElementById("root")).render(<React.StrictMode><App/></React.StrictMode>);