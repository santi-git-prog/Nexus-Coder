import urllib.request, json

data = json.dumps({
  "code": "print('Hello Python from Nexus')",
  "language": "python"
}).encode()

req = urllib.request.Request(
  'http://localhost:5000/api/run-playground',
  data=data,
  headers={'Content-Type': 'application/json'}
)

try:
    response = urllib.request.urlopen(req)
    print(response.read().decode())
except Exception as e:
    print(f"Error: {e}")
