#!/usr/bin/env bun
import { App } from "aws-cdk-lib";
import { CodetypeStack } from "../lib/stack";

const app = new App();

new CodetypeStack(app, "codetype-solo", {
    stackName: "codetype-solo",
    env: {
        region: process.env.CDK_DEFAULT_REGION ?? "ap-southeast-1",
        account: process.env.CDK_DEFAULT_ACCOUNT,
    },
});
