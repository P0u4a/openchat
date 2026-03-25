# OpenChat Protocol Specification (WIP)

### Version

0.0.1

## Overview

The purpose of this document is to define a standard method and format for different AI clients to share conversation histories.
Currently OpenChat uses a browser extension and an MCP server which achieves this goal, but it's hacky. 
What we really need is an open standard. Within this document is where that standard is being developed.

## Conversation Schema

### Conversation

The top-level object representing a single conversation.

| Field      | Type                              | Required | Description                              |
| ---------- | --------------------------------- | -------- | ---------------------------------------- |
| id         | `string`                          | Yes      | Unique identifier for the conversation   |
| title      | `string`                          | Yes      | Display title of the conversation        |
| createdAt  | `string`                          | Yes      | ISO 8601 timestamp of creation           |
| updatedAt  | `string`                          | Yes      | ISO 8601 timestamp of last update        |
| source     | [`Source`](#source)               | Yes      | Origin platform and metadata             |
| messages   | [`Message[]`](#message)           | Yes      | Ordered list of messages                 |
| metadata   | `Record<string, unknown>`         | No       | Arbitrary key-value metadata             |

### Source

Describes where the conversation originated.

| Field          | Type                        | Required | Description                                      |
| -------------- | --------------------------- | -------- | ------------------------------------------------|
| platform       | [`Platform`](#platform)     | Yes      | The provider platform the conversation came from |
| conversationId | `string`                    | Yes      | Platform-specific conversation identifier        |
| url            | `string`                    | Yes      | URL to the original conversation                 |
| model          | `string`                    | No       | Model used in the conversation                   |

### Platform

The string identifier of a supported platform.

```
"chatgpt" | "claude"
```

### Message

A single message in the conversation.

| Field             | Type                                    | Required | Description                                    |
| ----------------- | --------------------------------------- | -------- | ---------------------------------------------- |
| id                | `string`                                | Yes      | Unique identifier for the message              |
| role              | `"system" \| "user" \| "assistant"`     | Yes      | Who sent the message                           |
| content           | [`ContentBlock[]`](#contentblock)       | Yes      | Array of content blocks making up the message  |
| timestamp         | `string`                                | No       | ISO 8601 timestamp                             |
| model             | `string`                                | No       | Model that generated this message              |
| parentId          | `string`                                | No       | ID of the parent message (for branching)       |
| platformMessageId | `string`                                | No       | Platform-specific message identifier           |
| attachments       | [`Attachment[]`](#attachment)           | No       | Files attached to the message                  |

### Attachment

A file attached to a message.

| Field    | Type     | Required | Description              |
| -------- | -------- | -------- | ------------------------ |
| filename | `string` | Yes      | Name of the file         |
| mimeType | `string` | Yes      | MIME type of the file    |
| url      | `string` | No       | URL to the file          |
| content  | `string` | No       | Inline file content      |

### ContentBlock

A part of the message. A message's `content` is an array of these blocks.

#### `text`

| Field | Type     | Description    |
| ----- | -------- | -------------- |
| type  | `"text"` | Block type     |
| text  | `string` | The text body  |

#### `code`

| Field    | Type     | Description           |
| -------- | -------- | --------------------- |
| type     | `"code"` | Block type            |
| language | `string` | Programming language  |
| code     | `string` | The code content      |

#### `image`

| Field | Type      | Required | Description           |
| ----- | --------- | -------- | --------------------- |
| type  | `"image"` | Yes      | Block type            |
| url   | `string`  | Yes      | URL to the image      |
| alt   | `string`  | No       | Alt text description  |

#### `thinking`

| Field | Type         | Description                       |
| ----- | ------------ | --------------------------------- |
| type  | `"thinking"` | Block type                        |
| text  | `string`     | The model's chain-of-thought text |

#### `tool_use`

| Field | Type                      | Description                |
| ----- | ------------------------- | -------------------------- |
| type  | `"tool_use"`              | Block type                 |
| id    | `string`                  | Unique tool use identifier |
| name  | `string`                  | Name of the tool called    |
| input | `Record<string, unknown>` | Tool input parameters      |

#### `tool_result`

| Field     | Type            | Required | Description                       |
| --------- | --------------- | -------- | --------------------------------- |
| type      | `"tool_result"` | Yes      | Block type                        |
| toolUseId | `string`        | Yes      | ID of the corresponding tool_use  |
| content   | `string`        | Yes      | The tool's output                 |
| isError   | `boolean`       | No       | Whether the tool call errored     |

#### `artifact`

| Field      | Type         | Description                              |
| ---------- | ------------ | ---------------------------------------- |
| type       | `"artifact"` | Block type                               |
| identifier | `string`     | Unique identifier for the artifact       |
| title      | `string`     | Display title                            |
| content    | `string`     | The artifact content                     |
| mimeType   | `string`     | MIME type of the content                 |
