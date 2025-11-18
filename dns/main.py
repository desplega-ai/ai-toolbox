import dns.resolver
import re

def get_a24z_id(domain):
    """
    Query _a24z.domain for TXT record and extract the ID.
    
    Args:
        domain: The domain to query (e.g., 'tarasyarema.com')
    
    Returns:
        The ID string if found, None otherwise
    """
    query_name = f"_a24z.{domain}"
    
    try:
        # Query TXT records
        answers = dns.resolver.resolve(query_name, 'TXT')
        
        for rdata in answers:
            # TXT records are returned as quoted strings
            txt_string = rdata.to_text().strip('"')
            
            # Extract ID using regex
            match = re.search(r'id=([a-f0-9-]+)', txt_string)
            if match:
                return match.group(1)
        
        return None
        
    except dns.resolver.NXDOMAIN:
        print(f"Domain {query_name} does not exist")
        return None
    except dns.resolver.NoAnswer:
        print(f"No TXT record found for {query_name}")
        return None
    except Exception as e:
        print(f"Error querying DNS: {e}")
        return None


# Example usage
if __name__ == "__main__":
    domain = "tarasyarema.com"
    id_value = get_a24z_id(domain)
    
    if id_value:
        print(f"ID: {id_value}")
    else:
        print("No ID found")
