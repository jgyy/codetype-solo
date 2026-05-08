#!/usr/bin/env bun
import { App } from "aws-cdk-lib";
import { CodetypeStack } from "../lib/stack";
import { CodetypeCertStack } from "../lib/cert-stack";

const app = new App();

const account = process.env.CDK_DEFAULT_ACCOUNT;
const region = process.env.CDK_DEFAULT_REGION ?? "ap-southeast-1";
const domainName = "solo.codephase.dev";
const zoneName = "codephase.dev";

const certStack = new CodetypeCertStack(app, "codetype-solo-cert", {
    stackName: "codetype-solo-cert",
    env: { account, region: "us-east-1" },
    crossRegionReferences: true,
    domainName,
    zoneName,
});

new CodetypeStack(app, "codetype-solo", {
    stackName: "codetype-solo",
    env: { account, region },
    crossRegionReferences: true,
    domainName,
    zoneName,
    certificate: certStack.certificate,
});
