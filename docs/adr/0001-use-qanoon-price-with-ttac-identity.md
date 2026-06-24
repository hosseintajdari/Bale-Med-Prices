# Use Qanoon Pharma for price and TTAC for medicine identity

Accepted. In the initial patient-facing phase, the displayed consumer unit price comes from `Qanoon Pharma` because its pharmacy pricing logic is richer, while `TTAC` is used to strengthen patient-facing medicine identity such as brand and package type. When `TTAC` and `Qanoon Pharma` prices differ, the product should show one clear patient price with a simple price difference warning rather than exposing multiple raw prices; a higher `TTAC`-derived price is not used to automatically replace the primary `Qanoon Pharma` price.
