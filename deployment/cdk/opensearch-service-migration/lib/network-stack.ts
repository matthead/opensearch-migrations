import {Stack} from "aws-cdk-lib";
import {
    IpAddresses, IVpc, Port, SecurityGroup,
    SubnetType,
    Vpc
} from "aws-cdk-lib/aws-ec2";
import {Construct} from "constructs";
import {StackPropsExt} from "./stack-composer";
import {StringParameter} from "aws-cdk-lib/aws-ssm";

export interface NetworkStackProps extends StackPropsExt {
    readonly vpcId?: string
    readonly vpcAZCount?: number
    readonly targetClusterEndpoint?: string
}

export class NetworkStack extends Stack {
    public readonly vpc: IVpc;

    // Validate a proper url string is provided and return an url string which contains a protocol, host name, and port.
    // If a port is not provided, the default protocol port (e.g. 443, 80) will be explicitly added
    static validateAndReturnFormattedHttpURL(urlString: string) {
        // URL will throw error if the urlString is invalid
        let url = new URL(urlString);
        if (url.protocol !== "http:" && url.protocol !== "https:") {
            throw new Error(`Invalid url protocol for target endpoint: ${urlString} was expecting 'http' or 'https'`)
        }
        if (url.pathname !== "/") {
            throw new Error(`Provided target endpoint: ${urlString} must not contain a path: ${url.pathname}`)
        }
        // URLs that contain the default protocol port (e.g. 443, 80) will not show in the URL toString()
        let formattedUrlString = url.toString()
        if (formattedUrlString.endsWith("/")) {
            formattedUrlString = formattedUrlString.slice(0, -1)
        }
        if (!url.port) {
            if (url.protocol === "http:") {
                formattedUrlString = formattedUrlString.concat(":80")
            }
            else {
                formattedUrlString = formattedUrlString.concat(":443")
            }
        }
        return formattedUrlString
    }

    private validateVPC(vpc: IVpc) {
        let uniqueAzPrivateSubnets: string[] = []
        if (vpc.privateSubnets.length > 0) {
            uniqueAzPrivateSubnets = vpc.selectSubnets({
                subnetType: SubnetType.PRIVATE_WITH_EGRESS,
                onePerAz: true
            }).subnetIds
        }
        console.info(`Detected VPC with ${vpc.privateSubnets.length} private subnets, ${vpc.publicSubnets.length} public subnets, and ${vpc.isolatedSubnets.length} isolated subnets`)
        if (uniqueAzPrivateSubnets.length < 2) {
            throw new Error(`Not enough AZs (${uniqueAzPrivateSubnets.length} unique AZs detected) used for private subnets to meet 2 or 3 AZ requirement`)
        }
    }

    constructor(scope: Construct, id: string, props: NetworkStackProps) {
        super(scope, id, props);

        // Retrieve original deployment VPC for addon deployments
        if (props.addOnMigrationDeployId) {
            const vpcId = StringParameter.valueForStringParameter(this, `/migration/${props.stage}/${props.defaultDeployId}/vpcId`)
            this.vpc = Vpc.fromLookup(this, 'domainVPC', {
                vpcId: vpcId,
            });
        }
        // Retrieve existing VPC
        else if (props.vpcId) {
            this.vpc = Vpc.fromLookup(this, 'domainVPC', {
                vpcId: props.vpcId,
            });
        }
        // Create new VPC
        else {
            const zoneCount = props.vpcAZCount
            // Either 2 or 3 AZ count must be used
            if (zoneCount && zoneCount !== 2 && zoneCount !== 3) {
                throw new Error(`Required vpcAZCount is 2 or 3 but received: ${zoneCount}`)
            }
            this.vpc = new Vpc(this, 'domainVPC', {
                // IP space should be customized for use cases that have specific IP range needs
                ipAddresses: IpAddresses.cidr('10.0.0.0/16'),
                maxAzs: zoneCount ? zoneCount : 2,
                subnetConfiguration: [
                    // Outbound internet access for private subnets require a NAT Gateway which must live in
                    // a public subnet
                    {
                        name: 'public-subnet',
                        subnetType: SubnetType.PUBLIC,
                        cidrMask: 24,
                    },
                    // Nodes will live in these subnets
                    {
                        name: 'private-subnet',
                        subnetType: SubnetType.PRIVATE_WITH_EGRESS,
                        cidrMask: 24,
                    },
                ],
            });
        }
        this.validateVPC(this.vpc)

        if (!props.addOnMigrationDeployId) {
            new StringParameter(this, 'SSMParameterVpcId', {
                description: 'OpenSearch migration parameter for VPC id',
                parameterName: `/migration/${props.stage}/${props.defaultDeployId}/vpcId`,
                stringValue: this.vpc.vpcId
            });

            // Create a default SG which only allows members of this SG to access the Domain endpoints
            const defaultSecurityGroup = new SecurityGroup(this, 'osClusterAccessSG', {
                vpc: this.vpc,
                allowAllOutbound: false,
            });
            defaultSecurityGroup.addIngressRule(defaultSecurityGroup, Port.allTraffic());

            new StringParameter(this, 'SSMParameterOpenSearchAccessGroupId', {
                description: 'OpenSearch migration parameter for target OpenSearch access security group id',
                parameterName: `/migration/${props.stage}/${props.defaultDeployId}/osAccessSecurityGroupId`,
                stringValue: defaultSecurityGroup.securityGroupId
            });
        }

        if (props.targetClusterEndpoint) {
            const formattedClusterEndpoint = NetworkStack.validateAndReturnFormattedHttpURL(props.targetClusterEndpoint)
            const deployId = props.addOnMigrationDeployId ? props.addOnMigrationDeployId : props.defaultDeployId
            new StringParameter(this, 'SSMParameterOpenSearchEndpoint', {
                description: 'OpenSearch migration parameter for OpenSearch endpoint',
                parameterName: `/migration/${props.stage}/${deployId}/osClusterEndpoint`,
                stringValue: formattedClusterEndpoint
            });
        }

    }
}