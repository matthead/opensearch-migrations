import {StackPropsExt} from "../stack-composer";
import {IVpc, SecurityGroup} from "aws-cdk-lib/aws-ec2";
import {CpuArchitecture, PortMapping, Protocol} from "aws-cdk-lib/aws-ecs";
import {Construct} from "constructs";
import {join} from "path";
import {MigrationServiceCore} from "./migration-service-core";
import {StringParameter} from "aws-cdk-lib/aws-ssm";
import {StreamingSourceType} from "../streaming-source-type";
import {createMSKProducerIAMPolicies} from "../common-utilities";
import {OtelCollectorSidecar} from "./migration-otel-collector-sidecar";


export interface CaptureProxyESProps extends StackPropsExt {
    readonly vpc: IVpc,
    readonly streamingSourceType: StreamingSourceType,
    readonly otelCollectorEnabled: boolean,
    readonly fargateCpuArch: CpuArchitecture,
    readonly extraArgs?: string,
}

/**
 * The stack for the "capture-proxy-es" service. This service will spin up a Capture Proxy instance
 * and an Elasticsearch with Search Guard instance on a single container. You will also find in this directory these two
 * items split into their own services to give more flexibility in setup.
 */
export class CaptureProxyESStack extends MigrationServiceCore {

    constructor(scope: Construct, id: string, props: CaptureProxyESProps) {
        super(scope, id, props)
        let securityGroups = [
            SecurityGroup.fromSecurityGroupId(this, "serviceSG", StringParameter.valueForStringParameter(this, `/migration/${props.stage}/${props.defaultDeployId}/serviceSecurityGroupId`)),
            SecurityGroup.fromSecurityGroupId(this, "trafficStreamSourceAccessSG", StringParameter.valueForStringParameter(this, `/migration/${props.stage}/${props.defaultDeployId}/trafficStreamSourceAccessSecurityGroupId`))
        ]

        const servicePort: PortMapping = {
            name: "capture-proxy-es-connect",
            hostPort: 9200,
            containerPort: 9200,
            protocol: Protocol.TCP
        }
        const esServicePort: PortMapping = {
            name: "es-connect",
            hostPort: 19200,
            containerPort: 19200,
            protocol: Protocol.TCP
        }

        const servicePolicies = props.streamingSourceType === StreamingSourceType.AWS_MSK ? createMSKProducerIAMPolicies(this, this.partition, this.region, this.account, props.stage, props.defaultDeployId) : []

        let brokerEndpoints = StringParameter.valueForStringParameter(this, `/migration/${props.stage}/${props.defaultDeployId}/kafkaBrokers`);
        let command = `/usr/local/bin/docker-entrypoint.sh eswrapper & /runJavaWithClasspath.sh org.opensearch.migrations.trafficcapture.proxyserver.CaptureProxy --kafkaConnection ${brokerEndpoints} --destinationUri https://localhost:19200 --insecureDestination --listenPort 9200 --sslConfigFile /usr/share/elasticsearch/config/proxy_tls.yml`
        command = props.streamingSourceType === StreamingSourceType.AWS_MSK ? command.concat(" --enableMSKAuth") : command
        command = props.otelCollectorEnabled ? command.concat(` --otelCollectorEndpoint http://localhost:${OtelCollectorSidecar.OTEL_CONTAINER_PORT}`) : command
        command = props.extraArgs ? command.concat(` ${props.extraArgs}`) : command
        this.createService({
            serviceName: "capture-proxy-es",
            dockerDirectoryPath: join(__dirname, "../../../../../", "TrafficCapture/dockerSolution/build/docker/trafficCaptureProxyServer"),
            dockerImageCommand: ['/bin/sh', '-c', command.concat(" & wait -n 1")],
            securityGroups: securityGroups,
            taskRolePolicies: servicePolicies,
            portMappings: [servicePort, esServicePort],
            environment: {
                // Set Elasticsearch port to 19200 to allow capture proxy at port 9200
                "http.port": "19200"
            },
            serviceDiscoveryEnabled: true,
            serviceDiscoveryPort: 19200,
            cpuArchitecture: props.fargateCpuArch,
            taskCpuUnits: 1024,
            taskMemoryLimitMiB: 4096,
            ...props
        });
    }

}