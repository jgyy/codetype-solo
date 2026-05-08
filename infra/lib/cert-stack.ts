import { Stack, type StackProps } from "aws-cdk-lib";
import {
  Certificate,
  CertificateValidation,
  type ICertificate,
} from "aws-cdk-lib/aws-certificatemanager";
import { HostedZone } from "aws-cdk-lib/aws-route53";
import type { Construct } from "constructs";

export interface CodetypeCertStackProps extends StackProps {
  domainName: string;
  zoneName: string;
}

export class CodetypeCertStack extends Stack {
  readonly certificate: ICertificate;

  constructor(scope: Construct, id: string, props: CodetypeCertStackProps) {
    super(scope, id, props);

    const zone = HostedZone.fromLookup(this, "Zone", {
      domainName: props.zoneName,
    });

    this.certificate = new Certificate(this, "Cert", {
      domainName: props.domainName,
      validation: CertificateValidation.fromDns(zone),
    });
  }
}
