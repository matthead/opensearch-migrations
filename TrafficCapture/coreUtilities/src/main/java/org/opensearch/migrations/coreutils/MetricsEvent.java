package org.opensearch.migrations.coreutils;

public enum MetricsEvent {
    CONNECTION_OPENED,
    CONNECTION_CLOSED,
    BACKSIDE_HANDLER_CHANNEL_ACTIVE,
    BACKSIDE_HANDLER_CHANNEL_CLOSED,
    BACKSIDE_HANDLER_EXCEPTION,
    RECORD_SENT_TO_KAFKA,
    RECORD_FAILED_TO_KAFKA,
    RECORD_RECEIVED_FROM_KAFKA,
    RECORD_FAILED_FROM_KAFKA,
    PARSED_TRAFFIC_STREAM_FROM_KAFKA,
    PARSING_TRAFFIC_STREAM_FROM_KAFKA_FAILED,
    ACCUMULATED_FULL_CAPTURED_SOURCE_REQUEST,
    ACCUMULATED_FULL_CAPTURED_SOURCE_RESPONSE,
    CAPTURED_REQUEST_PARSED_TO_HTTP,
    WRITING_REQUEST_COMPONENT_FAILED,
    WROTE_REQUEST_COMPONENT,
    RECEIVED_REQUEST_COMPONENT,
    RECEIVED_FULL_HTTP_REQUEST,
    RECEIVED_RESPONSE_COMPONENT,
    RECEIVING_RESPONSE_COMPONENT_FAILED,
    RECEIVED_FULL_HTTP_RESPONSE,
    RECEIVING_FULL_HTTP_RESPONSE_FAILED,
    SCHEDULED_REQUEST_TO_BE_SENT,
    REQUEST_WAS_TRANSFORMED,
    TRANSFORMING_REQUEST_FAILED,
    REQUEST_REDRIVEN_WITHOUT_TRANSFORMATION
}