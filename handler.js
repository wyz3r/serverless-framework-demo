const { v4: uuidv4 } = require('uuid')

const { SQSClient, SendMessageCommand } = require("@aws-sdk/client-sqs");
// Create an SQS client
const sqsClient = new SQSClient({ region: process.env.REGION });

const {DynamoDBClient} = require("@aws-sdk/client-dynamodb")
const {DynamoDBDocumentClient, PutCommand, UpdateCommand, GetCommand} = require("@aws-sdk/lib-dynamodb")

// create DynamoClient 
const dynamoClient = new DynamoDBClient({region: process.env.REGION})
const docClient = DynamoDBDocumentClient.from(dynamoClient)

exports.newOrder = async (event) => {

    const orderId = uuidv4()
    console.log(orderId)

    let orderDetails;
    try {
        orderDetails = JSON.parse(event.body)
    } catch (error) {
        console.error("Error parsing order details:", error)
        return {
            statusCode: 400,
            body: JSON.stringify({ message: "invalid JSON format in order details" })
        }
    }
    console.log(orderDetails)
    const order = { orderId, ...orderDetails }

    // save order in the database
    await saveItemToDynamoDb(order)

    // send message in the queue 
    const PENDING_ORDERS_QUEUE = process.env.PENDING_ORDERS_QUEUE
    await sendMessageToSQS(order, PENDING_ORDERS_QUEUE)
    return {
        statusCode: 200,
        body: JSON.stringify({
            message: order
        })
    }

};

exports.getOrder = async (event) => {

    console.log(event)
    const orderId = event.pathParameters.orderId
   
    try {
        const order = await getItemFromDynamoDB(orderId);
        console.log(order)
        return {
          statusCode: 200,
          body: JSON.stringify(order)
        };
       } catch (error) {
        console.error("Error retrieving order:", error);
    
        if (error.name === "ItemNotFoundException") {
          return {
            statusCode: 404,
            body: JSON.stringify({ message: "Order not found" }),
          };
        } else {
          return {
            statusCode: 500,
            body: JSON.stringify({ message: "Error retrieving order" }),
          };
        }
      }
};

exports.preOrder = async (event) => {
    console.log(event)
    const body = JSON.parse(event.Records[0].body)
    const orderId = body.orderId
    await updateStatusInOrder(orderId, "COMPLETED")
    return;
}

async function sendMessageToSQS(message,queueURL) {
    const params = {
        QueueUrl: queueURL,
        MessageBody: JSON.stringify(message)
    }
    console.log(params)
    try {
        const command = new SendMessageCommand(params)
        const data = await sqsClient.send(command)
        console.log("Message sent Successfully", data.MessageId)
        return data

    } catch (error) {
        console.error("Error sending Message", error)
        throw error
    }
} 

exports.sendOrder = async (event) =>  {
    console.log(event)
    const order = {
        orderId: event.orderId,
        pizza: event.pizza,
        customerId: event.customerId
    }

    const ORDER_TO_SEND_QUEUE = process.env.ORDER_TO_SEND_QUEUE
    await sendMessageToSQS(order, ORDER_TO_SEND_QUEUE) 
    return 
}

async function saveItemToDynamoDb(item) {
    const params = {
        TableName: process.env.ORDERS_TABLE,
        Item: item
    }
    console.log(params)
    try {
        const command = new PutCommand(params)
        const response = await docClient.send(command)
        console.log('item saved successfully', response)
        return response
        
    } catch (error) {
        console.error('error saving item', error)
        throw error
        
    }
}

async function updateStatusInOrder(orderId, status) {
    const params = {
        TableName: process.env.ORDERS_TABLE,
        Key: {orderId},
        UpdateExpression: "SET order_status = :c",
        ExpressionAttributeValues: {
            ":c": status
        },
        ReturnValues: "ALL_NEW"
    }
    console.log(params)
    try {
        const command = new UpdateCommand(params)
        const response = await docClient.send(command)
        console.log("Item updated successfully", response)
        return response.Attributes
    } catch (error) {
        console.error("error updating item:", error)
        throw error
        
    }
}

async function getItemFromDynamoDB(orderId) {
    const params = {
        TableName: process.env.ORDERS_TABLE,
        Key: {orderId},
    }

    console.log(params)

    try {
        const command = new GetCommand(params)
        const response = await docClient.send(command)

        if(response.Item) {
            console.log("item retrieved successfully", response.Item)
            return response.Item
        } else {
            console.log("item not found")
            let notFoundError = new Error("item not found")
            notFoundError.name = "itemNotFoundException"
            throw notFoundError
        }
        
    } catch (error) {
        console.error("error retrieving item:", error)
        throw error
        
    }
    
}