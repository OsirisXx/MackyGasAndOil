# Bugfix Requirements Document

## Introduction

The broadcast subscription for price change updates is failing to establish a stable WebSocket connection in the POS terminal. The subscription initially shows "SUBSCRIBED" status but immediately times out and closes, preventing automatic price updates when scheduled price changes execute. This forces users to manually refresh the page to see updated pump prices, defeating the purpose of the real-time broadcast system.

The root cause is React 18 Strict Mode's double-mounting behavior in development, which triggers the useEffect cleanup function before the WebSocket connection is fully established. The cleanup function removes the channel and sets `channelRef.current` to null, and the guard condition `if (channelRef.current) return` prevents re-subscription, leaving the POS terminal without a working broadcast connection.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN the POS component mounts in React 18 Strict Mode THEN the broadcast subscription is created and immediately cleaned up, resulting in a TIMED_OUT status

1.2 WHEN the cleanup function runs before the WebSocket connection is fully established THEN the channelRef is set to null and the guard condition prevents re-subscription

1.3 WHEN the WebSocket connection times out THEN the console shows "WebSocket is closed before the connection is established" and no automatic price updates are received

1.4 WHEN a scheduled price change executes THEN the POS terminal does NOT receive the broadcast message and prices do NOT update automatically

1.5 WHEN the subscription fails THEN users must manually refresh the page to see updated pump prices

### Expected Behavior (Correct)

2.1 WHEN the POS component mounts in React 18 Strict Mode THEN the broadcast subscription SHALL establish and maintain a stable WebSocket connection despite double-mounting

2.2 WHEN the cleanup function runs during re-mounting THEN the subscription SHALL be properly cleaned up and a new subscription SHALL be successfully created

2.3 WHEN the WebSocket connection is established THEN the subscription status SHALL remain "SUBSCRIBED" and the connection SHALL stay open

2.4 WHEN a scheduled price change executes THEN the POS terminal SHALL receive the broadcast message and pump prices SHALL update automatically without requiring a page refresh

2.5 WHEN the subscription is active THEN users SHALL see automatic price updates with a toast notification and updated pump prices in the UI

### Unchanged Behavior (Regression Prevention)

3.1 WHEN a price change broadcast is received THEN the system SHALL CONTINUE TO display a toast notification with the message "⚠️ PRICE UPDATE: X pump price(s) have been changed"

3.2 WHEN a price change broadcast is received THEN the system SHALL CONTINUE TO call fetchPumps() to refresh pump data in the background

3.3 WHEN the component unmounts (user navigates away) THEN the system SHALL CONTINUE TO properly clean up the subscription and remove the channel

3.4 WHEN the cashier has no branch_id and no selectedBranchId THEN the system SHALL CONTINUE TO skip subscription creation (early return)

3.5 WHEN the subscription is successfully established THEN the system SHALL CONTINUE TO log "[Broadcast] Successfully subscribed to price change broadcasts" to the console
